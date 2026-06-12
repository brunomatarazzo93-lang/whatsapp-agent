import os
from flask import Flask, request
from twilio.twiml.messaging_response import MessagingResponse
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Configurar Gemini
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-2.0-flash")

# Sesiones en memoria (por numero de telefono)
sessions = {}

# ===== PERSONALIZA ESTO =====
SYSTEM_PROMPT = """Eres un asistente virtual amigable y profesional.
Tu nombre es Asistente AI.
Respondes siempre en español, de forma concisa y util.
Si no sabes algo, se honesto y ofrece alternativas."""
# ============================

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
          reply = "Lo siento, tuve un problema tecnico. Por favor intenta de nuevo."
          print(f"Error Gemini: {e}")

    resp = MessagingResponse()
    resp.message(reply)
    return str(resp)

@app.route("/health", methods=["GET"])
def health():
      return {"status": "ok", "agent": "WhatsApp AI Agent"}, 200

if __name__ == "__main__":
      port = int(os.environ.get("PORT", 5000))
      app.run(host="0.0.0.0", port=port, debug=False)
