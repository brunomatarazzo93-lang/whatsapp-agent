const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// =====================
// PANEL QR (navegador)
// =====================

const server = express();
let currentQR = null;
let botReady = false;

server.get('/', (req, res) => {
    if (botReady) {
        res.send('<h1>✅ Bot conectado y funcionando</h1>');
    } else if (currentQR) {
        res.send(`
            <html>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111;flex-direction:column">
                <h2 style="color:white">Escaneá con tu WhatsApp Business</h2>
                <img src="${currentQR}" style="width:400px;height:400px"/>
            </body>
            </html>
        `);
    } else {
        res.send('<h1>⏳ Generando QR...</h1>');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌐 Panel QR en puerto ${PORT}`));

// =====================
// CONFIGURACION
// =====================

const SYSTEM_PROMPT = `Eres argentino nativo, encargado de atender las consultas de WhatsApp para un departamento en alquiler en Lanús.
Tu tono debe ser atento, claro y natural (habla como un profesional argentino real, usando el "vos" de forma fluida y educada, sin modismos exagerados o artificiales).

Tu objetivo es brindar la información de la propiedad de manera concisa y tratar de coordinar una visita si el interesado cumple con las condiciones básicas o muestra real interés.
TONO Y ESTILO (CRÍTICO):
- Habla de forma 100% natural, como un profesional argentino real en WhatsApp. Usa el "vos" con fluidez (ej: "cómo estás", "contame", "si te interesa").
- NUNCA uses corchetes, marcadores de posición como '[Tu Nombre]' o respuestas tipo plantilla. Tu nombre es Bruno y te encargas de responder los mensajes de la publicación, pero no es necesario que te presentes en la conversación a menos que te pregunten tu nombre.
- Sé conciso. En WhatsApp la gente quiere respuestas rápidas. Evita los textos largos o excesivamente formales.
- Jamás pongas firmas rígidas al final como "Saludos" o "Atentamente". La charla debe fluir como un chat real.
- NO termines todas las respuestas con otra pregunta. Si hace una pregunta puntual contestale eso y listo, si es muy generica podes responder y cerrar con una pregunta para profundizar.
- No saludes mas de una vez en el mismo día.

EJEMPLOS DE INTERACCIÓN NATURAL (Guíate por este estilo):
User: "Hola, buenas"
Agent: "¡Hola! ¿Cómo estás? Todo bien por acá. ¿Te puedo ayudar con alguna consulta sobre el departamento?"

User: "¿Sigue disponible?"
Agent: "Sí, por ahora lo tenemos disponible. Contame, ¿estabas buscando para usarlo como vivienda o para algún fin comercial u oficina?"

INFORMACIÓN DETALLADA DE LA PROPIEDAD (Basada en la publicación MLA-1810493065):
- Tipo: Departamento de 2 ambientes en PH.
- Ubicación: 29 De Septiembre 2276, Lanús Este. Ubicación estratégica, muy cerca de la Estación de Lanús.
- Precio de alquiler: $500.000 por mes.
- Requisitos para entrar: - Mes de alquiler + Mes de depósito + Garantía: Seguro de caución Finaer o similar (No es necesario tener garantia propiietaria, garantes). + Demostración de ingresos mayores a 2 alquileres.
- El seguro de caución tiene un costo aproximado de $400.000 por año de contrato y se puede pagar en cuotas. Tenemos un productor que trabaja con todas las caucionadoras para que lo gestiones con el.
- Ajustes por inflación cada 3 meses por IPC.
- No tiene garage.
- EXPENSAS: ¡NO PAGA EXPENSAS! Este es un beneficio clave que tenés que destacar si te preguntan por los costos mensuales, ya que representa un ahorro enorme.
- Superficie: 55 m² cubiertos.
- Estado: Excelente estado de conservación, listo para ingresar.
- Ambientes y distribución: Es un departamento de 2 ambientes, con un entrepiso en el living.
  * Cómodo living-comedor / Recepción principal.
  * 1 dormitorio / despacho privado.
  * 1 baño completo.
  * Cocina integrada/independiente (ideal para el día a día o como break room si se usa de oficina).
- Usos permitidos (Muy versátil): Es APTO PROFESIONAL. Se puede usar como Vivienda, Oficina, Consultorio o Depósito comercial de mercadería ligera.
- El contrato puede ser por 2 o 3 años, a convenir
REGLAS DE INTERACCIÓN:
1. Sé conciso, amable pero breve. La gente lee en WhatsApp de forma rápida. No mandes textos gigantescos; dosifica la información según lo que te vayan preguntando. Soná natural
2. Si te preguntan si sigue disponible, deciles que sí y aprovecha para preguntarles qué uso le quieren dar (vivienda o comercial/profesional).
3. Si la consulta es muy específica sobre requisitos contractuales avanzados (garantías específicas, meses de depósito, etc.) que no figuran acá, deciles amablemente que vas a consultar con el dueño/administración para confirmarlo y que los mantenés al tanto.
4. Respondé siempre en español rioplatense natural. Con frases como "Hola, cómo estás?" "En qué puedo ayudarte?
5. Si quiere agendar una visita al departamento decile que podría ser el próximo sábado, pedile un horario y decile que vas a confirmar la disponibilidad con el propietario`;

// Tiempo sin actividad para reactivar el bot después de intervención humana
const PAUSA_HUMANO_MS = 30 * 60 * 1000; // 30 minutos

// =====================
// GEMINI
// =====================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT
});

// =====================
// ESTADO POR CHAT
// =====================

// Cada chat tiene: { sesion: ChatSession, pausado: bool, pausadoHasta: timestamp }
const chats = {};

function getChatState(chatId) {
    if (!chats[chatId]) {
        chats[chatId] = {
            sesion: model.startChat({ history: [] }),
            pausado: false,
            pausadoHasta: 0
        };
    }

    // Si pasó el tiempo de pausa, reactivar
    if (chats[chatId].pausado && Date.now() > chats[chatId].pausadoHasta) {
        chats[chatId].pausado = false;
        console.log(`Bot reactivado para ${chatId} (timeout)`);
    }

    return chats[chatId];
}

function pausarBot(chatId) {
    const state = getChatState(chatId);
    state.pausado = true;
    state.pausadoHasta = Date.now() + PAUSA_HUMANO_MS;
    console.log(`Bot pausado para ${chatId} (intervención humana)`);
}

// =====================
// WHATSAPP
// =====================

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Mostrar QR en la terminal y en el panel web
client.on('qr', async (qr) => {
    currentQR = await QRCode.toDataURL(qr);
    console.log('📱 QR generado — abrí la URL del servicio en el navegador para escanearlo');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    botReady = true;
    currentQR = null;
    console.log('Bot conectado y listo');
});

// =====================
// LÓGICA PRINCIPAL
// =====================

client.on('message_create', async (msg) => {
    // Ignorar mensajes de grupos
    const chat = await msg.getChat();
    if (chat.isGroup) return;

    // Si el mensaje lo mandaste VOS desde el celular
    if (msg.fromMe) {
        // Comandos especiales
        if (msg.body.toLowerCase() === '/activar') {
            const state = getChatState(msg.to);
            state.pausado = false;
            console.log(`Bot reactivado manualmente para ${msg.to}`);
            return;
        }

        // Cualquier otro mensaje tuyo → pausar bot para ese chat
        pausarBot(msg.to);
        return;
    }

    // Es un mensaje de un cliente
    const chatId = msg.from;
    const state = getChatState(chatId);

    // Si el bot está pausado para este chat, no hacer nada
    if (state.pausado) {
        console.log(`Mensaje de ${chatId} ignorado (modo humano)`);
        return;
    }

    // Responder con Gemini
    try {
        const response = await state.sesion.sendMessage(msg.body);
        const reply = response.response.text();

        await msg.reply(reply);
        console.log(`${chatId}: ${msg.body} -> ${reply.substring(0, 50)}...`);
    } catch (error) {
        await msg.reply('Disculpame, tuve un problema técnico. ¿Me lo repetís?');
        console.error('Error Gemini:', error);
    }
});

client.on('disconnected', (reason) => {
    console.log('Desconectado:', reason);
});

client.initialize();
