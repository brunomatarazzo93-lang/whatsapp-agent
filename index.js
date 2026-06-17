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

const SYSTEM_PROMPT = process.env.PROMPT_AGENTE;

if (!SYSTEM_PROMPT) {
    throw new Error('Falta la variable de entorno PROMPT_AGENTE con el prompt del agente');
}

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

// Chats a los que el bot está enviando un mensaje en este momento, para no
// confundirlo con intervención humana (whatsapp-web.js dispara message_create
// también para los mensajes que manda el propio bot)
const enviandoBot = new Set();

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
        // Ignorar los mensajes que mandó el propio bot (no son intervención humana)
        if (enviandoBot.has(msg.to)) {
            return;
        }

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

    // Responder con Gemini (sin citar el mensaje original, para que la
    // conversación fluya como un chat normal)
    enviandoBot.add(chatId);
    try {
        const response = await state.sesion.sendMessage(msg.body);
        const reply = response.response.text();

        await chat.sendMessage(reply);
        console.log(`${chatId}: ${msg.body} -> ${reply.substring(0, 50)}...`);
    } catch (error) {
        await chat.sendMessage('Disculpame, tuve un problema técnico. ¿Me lo repetís?');
        console.error('Error Gemini:', error);
    } finally {
        enviandoBot.delete(chatId);
    }
});

client.on('disconnected', (reason) => {
    console.log('Desconectado:', reason);
});

client.initialize();
