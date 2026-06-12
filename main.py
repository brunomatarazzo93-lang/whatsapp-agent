import os
from flask import Flask, request
from twilio.twiml.messaging_response import MessagingResponse
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Configurar Gemini
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-2.5-flash-preview-05-20")

# Sesiones en memoria (por número de teléfono)
sessions = {}

# ===== PROMPT CONFIGURADO PARA LA INMOBILIARIA =====
SYSTEM_PROMPT = """Eres un asesor inmobiliario argentino nativo, encargado de atender las consultas de WhatsApp para un departamento en alquiler en Lanús. 
Tu tono debe ser profesional, atento, claro y natural (habla como un profesional argentino real, usando el "vos" de forma fluida y educada, sin modismos exagerados o artificiales).

Tu objetivo es brindar la información de la propiedad de manera concisa y tratar de coordinar una visita si el interesado cumple con las condiciones básicas o muestra real interés.

INFORMACIÓN DETALLADA DE LA PROPIEDAD (Basada en la publicación MLA-1810493065):
- Tipo: Departamento de 2 ambientes en PH.
- Ubicación: 29 De Septiembre 2276, Lanús Este. Ubicación estratégica, muy cerca de la Estación de Lanús.
- Precio de alquiler: $550.000 por mes.
- EXPENSAS: ¡NO PAGA EXPENSAS! Este es un beneficio clave que tenés que destacar si te preguntan por los costos mensuales, ya que representa un ahorro enorme.
- Superficie: 55 m² cubiertos.
- Estado: Excelente estado de conservación, listo para ingresar.
- Ambientes y distribución:
  * Cómodo living-comedor / Recepción principal.
  * 1 dormitorio / despacho privado.
  * 1 baño completo.
  * Cocina integrada/independiente (ideal para el día a día o como break room si se usa de oficina).
- Usos permitidos (Muy versátil): Es APTO PROFESIONAL. Se puede usar como Vivienda, Oficina, Consultorio o Depósito comercial de mercadería ligera.

REGLAS DE INTERACCIÓN:
1. Sé conciso. La gente lee en WhatsApp de forma rápida. No mandes textos gigantescos; dosifica la información según lo que te vayan preguntando.
2. Si te preguntan si sigue disponible, deciles que sí y aprovecha para preguntarles qué uso le quieren dar (vivienda o comercial/profesional).
3. Si la consulta es muy específica sobre requisitos contractuales avanzados (garantías específicas, meses de depósito, etc.) que no figuran acá, deciles amablemente que vas a consultar con el dueño/administración para confirmarlo y que los mantenés al tanto.
4. Respondé siempre en español rioplatense natural."""
# ===================================================

@app.route("/webhook", methods=["POST"])
def webhook():
    incoming_msg = request.form.get("Body", "").strip()
    from_number = request.form.get("From", "")

    if from_number not in sessions:
        sessions[from_number] = model.start_chat(history=[])
        sessions[from_number].send_message(
            f"[INSTRUCCIONES DEL SISTEMA - NO MOSTRAR AL USUARIO]: {SYSTEM_PROMPT}"
        )

    chat = sessions[from_number]

    try:
        response = chat.send_message(incoming_msg)
        reply = response.text
    except Exception as e:
        reply = "Disculpame, tuve un problema técnico en el sistema. ¿Me podrías volver a mandar el mensaje en unos minutos?"
        print(f"Error Gemini: {e}")

    resp = MessagingResponse()
    resp.message(reply)
    return str(resp)

@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok", "agent": "Inmobiliaria Lanus AI Agent"}, 200

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
