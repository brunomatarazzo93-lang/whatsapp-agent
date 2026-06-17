# WhatsApp Agent

Agente de WhatsApp para atención de consultas inmobiliarias, construido con [whatsapp-web.js](https://wwebjs.dev/) y [Gemini](https://ai.google.dev/).

## Cómo funciona

```
Tu WhatsApp Business (celular)
        +
Bot vinculado por QR (como WhatsApp Web)
        =
Los dos ven los mismos chats

Bot responde automáticamente
Vos respondés desde el celular → bot se pausa solo para ese chat
```

## Advertencia importante

`whatsapp-web.js` usa el protocolo de WhatsApp Web de forma no oficial. Meta no lo aprueba y hay riesgo (bajo pero real) de que te baneen el número si detectan uso automatizado intenso.

## Estructura del proyecto

```
whatsapp-agent/
├── index.js
├── package.json
├── .env
└── .wwebjs_auth/    ← se crea solo al escanear QR
```

## Configuración

Creá un archivo `.env` con:

```
GEMINI_API_KEY=tu_key
PROMPT_AGENTE=el prompt completo del agente, en una sola línea
```

`PROMPT_AGENTE` es el system prompt que define la personalidad y la información que maneja el agente. Si la variable no está definida, el bot no arranca.

## Run Locally

```bash
npm install
npm start
```

Escaneá el QR que aparece en la terminal con tu WhatsApp Business.

## Comandos

- Si vos respondés manualmente un chat desde el celular, el bot se pausa automáticamente para ese chat por 30 minutos.
- Para reactivar el bot manualmente en un chat, mandá `/activar` desde tu celular en ese chat.
