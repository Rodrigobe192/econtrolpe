require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.json());

// Estados del bot
const STATE = {
  START: 'start',
  NAME: 'name',
  DISTRICT: 'district',
  PROPERTY_TYPE: 'property_type',
  AREA: 'area',
  SERVICE: 'service',
  SERVICE_TYPE: 'service_type',
  CONTACT: 'contact'
};

// Mapeos de respuestas
const PROPERTY_TYPES_MAP = {
  '1': 'casa',
  '2': 'departamento',
  '3': 'local comercial',
  '4': 'local industrial',
  '5': 'otro'
};

const AREAS_MAP = {
  '1': '0-50 m²',
  '2': '51-100 m²',
  '3': '101-200 m²',
  '4': 'más de 200 m²'
};

const SERVICES_MAP = {
  '1': 'desinsectación integral',
  '2': 'fumigación de mercaderías',
  '3': 'control y monitoreo de roedores',
  '4': 'desinfección de ambientes',
  '5': 'limpieza de cisterna/reservorios',
  '6': 'limpieza de pozos sépticos',
  '7': 'mantenimiento de trampas de grasa',
  '8': 'otro servicio'
};

const SERVICE_TYPES_MAP = {
  '1': 'preventivo',
  '2': 'correctivo'
};

const CONTACT_OPTIONS_MAP = {
  '1': 'sí, por favor',
  '2': 'no, gracias'
};

// Almacenamiento temporal de datos
let userData = {};
let conversations = {};

// Función para enviar mensaje de texto
async function sendTextMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, 
      {
        messaging_product: "whatsapp",
        to,
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
        }
      }
    );

    // Registrar mensaje del bot
    if (!conversations[to]) conversations[to] = { responses: [] };
    conversations[to].responses.push({
      from: 'bot',
      text: text,
      timestamp: new Date()
    });

  } catch (err) {
    console.error("🚨 Error al enviar mensaje:", err.message);
  }
}

// Webhook de verificación
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Token inválido");
    res.sendStatus(403);
  }
});

// Webhook POST - Recepción de mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (
    !body.object ||
    !body.entry ||
    !body.entry[0] ||
    !body.entry[0].changes ||
    !body.entry[0].changes[0] ||
    !body.entry[0].changes[0].value ||
    !body.entry[0].changes[0].value.messages ||
    body.entry[0].changes[0].value.messages.length === 0
  ) {
    return res.sendStatus(200);
  }

  const message = body.entry[0].changes[0].value.messages[0];
  const from = message.from;
  let text = message.text?.body.toLowerCase().trim() || '';

  console.log("📩 Texto recibido:", text);

  // Iniciar si no tiene estado
  if (!userData[from]) {
    userData[from] = { state: STATE.START };
  }

  const user = userData[from];

  // Inicializar historial de conversación
  if (!conversations[from]) {
    conversations[from] = { responses: [] };
  }

  // Registrar mensaje del cliente
  if (text && text !== '') {
    conversations[from].responses.push({
      from: 'cliente',
      text: text,
      timestamp: new Date()
    });
  }

  try {
    switch (user.state) {
      case STATE.START:
        await sendTextMessage(
          from,
          "👋 ¡Buenos días/tardes/noches!\n\nBienvenido/a a Econtrol Saneamiento Ambiental.\n\n¿Podría indicarme su nombre completo?"
        );
        user.state = STATE.NAME;
        break;

      case STATE.NAME:
        user.name = text;
        await sendTextMessage(from, "📍 ¿En qué distrito se encuentra ubicado/a?");
        user.state = STATE.DISTRICT;
        break;

      case STATE.DISTRICT:
        user.district = text;
        await sendTextMessage(
          from,
          "🏡 ¿Qué tipo de local es?\n\n1. Casa\n2. Departamento\n3. Local Comercial\n4. Local Industrial\n5. Otro"
        );
        user.state = STATE.PROPERTY_TYPE;
        break;

      case STATE.PROPERTY_TYPE:
        const propertyMatch = PROPERTY_TYPES_MAP[text];
        if (!propertyMatch) {
          await sendTextMessage(
            from,
            "❌ Por favor, seleccione una opción válida:\n\n1. Casa\n2. Departamento\n3. Local Comercial\n4. Local Industrial\n5. Otro"
          );
          break;
        }

        user.propertyType = propertyMatch;
        await sendTextMessage(
          from,
          "📐 ¿Cuántos metros cuadrados tiene su inmueble?\n\n1. 0-50 m²\n2. 51-100 m²\n3. 101-200 m²\n4. Más de 200 m²"
        );
        user.state = STATE.AREA;
        break;

      case STATE.AREA:
        const areaMatch = AREAS_MAP[text];
        if (!areaMatch) {
          await sendTextMessage(
            from,
            "❌ Por favor, seleccione una opción válida:\n\n1. 0-50 m²\n2. 51-100 m²\n3. 101-200 m²\n4. Más de 200 m²"
          );
          break;
        }

        user.area = areaMatch;
        await sendTextMessage(
          from,
          "⚙️ ¿Qué servicio necesita?\n\n1. Desinsectación Integral\n2. Fumigación de mercaderías\n3. Control y Monitoreo de Roedores\n4. Desinfección de ambientes\n5. Limpieza de Cisterna/Reservorios\n6. Limpieza de Pozos Sépticos\n7. Mantenimiento de Trampas de Grasa\n8. Otro servicio"
        );
        user.state = STATE.SERVICE;
        break;

      case STATE.SERVICE:
        const serviceMatch = SERVICES_MAP[text];
        if (!serviceMatch) {
          await sendTextMessage(
            from,
            "❌ Por favor, seleccione una opción válida:\n\n1. Desinsectación Integral\n2. Fumigación de mercaderías\n3. Control y Monitoreo de Roedores\n4. Desinfección de ambientes\n5. Limpieza de Cisterna/Reservorios\n6. Limpieza de Pozos Sépticos\n7. Mantenimiento de Trampas de Grasa\n8. Otro servicio"
          );
          break;
        }

        user.service = serviceMatch;
        await sendTextMessage(
          from,
          "⚠️ ¿El servicio es Preventivo o Correctivo?\n\n1. Preventivo (mantenimiento regular)\n2. Correctivo (solución a problema existente)"
        );
        user.state = STATE.SERVICE_TYPE;
        break;

      case STATE.SERVICE_TYPE:
        const serviceTypeMatch = SERVICE_TYPES_MAP[text];
        if (!serviceTypeMatch) {
          await sendTextMessage(
            from,
            "❌ Por favor, responda con:\n\n1. Preventivo\n2. Correctivo"
          );
          break;
        }

        user.serviceType = serviceTypeMatch;
        await sendTextMessage(
          from,
          "📞 ¿Desea que un asesor le contacte?\n\n1. Sí, por favor\n2. No, gracias"
        );
        user.state = STATE.CONTACT;
        break;

      case STATE.CONTACT:
        const contactMatch = CONTACT_OPTIONS_MAP[text];
        if (!contactMatch) {
          await sendTextMessage(
            from,
            "❌ Por favor, responda con:\n\n1. Sí, por favor\n2. No, gracias"
          );
          break;
        }

        user.contact = contactMatch;

        // Enviar datos a Google Sheets
        try {
          await axios.post(process.env.APPS_SCRIPT_URL, {
            from,
            name: user.name,
            district: user.district,
            propertyType: user.propertyType,
            area: user.area,
            service: user.service,
            serviceType: user.serviceType,
            contact: user.contact
          });
          console.log("✅ Datos enviados a Google Sheets");

          await sendTextMessage(
            from,
            "✅ ¡Gracias por su solicitud!\n\nNos pondremos en contacto en el menor tiempo posible."
          );

          delete userData[from]; // Limpiar datos

        } catch (err) {
          console.error("🚨 Error al guardar en Sheets:", err.message);
          await sendTextMessage(
            from,
            "⚠️ Hubo un error guardando sus datos. Por favor, inténtelo más tarde."
          );
        }

        break;
    }

  } catch (error) {
    console.error("💥 Error general:", error.message);
  }

  res.sendStatus(200);
});

// Ruta /monitor - Interfaz web estilo WhatsApp Web
app.get('/monitor', (req, res) => {
  let html = `
    <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Monitor - Econtrol</title>
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
    />
    <style>
      * {
        box-sizing: border-box;
        font-family: 'Segoe UI', Roboto, sans-serif;
      }

      body {
        margin: 0;
        height: 100vh;
        display: flex;
        background-color: #eae6df;
      }

      .sidebar {
        width: 380px;
        background-color: #ffffff;
        display: flex;
        flex-direction: column;
        border-right: 1px solid #ccc;
      }

      .sidebar-header {
        background-color: #f0f2f5;
        padding: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-bottom: 1px solid #ccc;
      }

      .sidebar-header i {
        color: #128c7e;
        font-size: 1.5rem;
      }

      .sidebar h2 {
        font-size: 1.2rem;
        margin: 0;
        color: #128c7e;
      }

      .chat-list {
        flex: 1;
        overflow-y: auto;
        background-color: #ffffff;
      }

      .chat-item {
        padding: 15px;
        border-bottom: 1px solid #eee;
        cursor: pointer;
        transition: background 0.2s;
      }

      .chat-item:hover {
        background-color: #f0f2f5;
      }

      .selected-chat {
        flex: 1;
        display: flex;
        flex-direction: column;
        background-color: #e5ddd5;
        position: relative;
      }

      .chat-header {
        height: 60px;
        background-color: #128c7e;
        color: white;
        display: flex;
        align-items: center;
        padding: 0 20px;
        font-weight: bold;
        font-size: 1.1rem;
      }

      .chat-messages {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        background-image: url("https://i.imgur.com/O1Ia0Yz.png");
        background-repeat: repeat;
      }

      .message {
        max-width: 60%;
        padding: 10px 14px;
        margin-bottom: 10px;
        border-radius: 8px;
        position: relative;
        font-size: 0.95rem;
      }

      .from-client {
        background-color: #ffffff;
        align-self: flex-start;
        border-top-right-radius: 0;
      }

      .from-bot {
        background-color: #dcf8c6;
        align-self: flex-end;
        border-top-left-radius: 0;
      }

      .timestamp {
        font-size: 0.7rem;
        color: gray;
        text-align: right;
        margin-top: -5px;
      }

      .input-area {
        display: flex;
        padding: 10px;
        background-color: #f0f0f0;
        align-items: center;
      }

      input[type='text'] {
        flex: 1;
        padding: 10px 15px;
        border: none;
        border-radius: 20px;
        font-size: 1rem;
        outline: none;
      }

      button {
        background-color: #128c7e;
        color: white;
        border: none;
        margin-left: 10px;
        padding: 10px 20px;
        border-radius: 50%;
        font-size: 1.1rem;
        cursor: pointer;
      }

      button:hover {
        background-color: #0e6655;
      }
    </style>
  </head>
  <body>
    <div class="sidebar">
      <div class="sidebar-header">
        <i class="fas fa-comments"></i>
        <h2>Chats</h2>
      </div>
      <div class="chat-list" id="chatList"></div>
    </div>

    <div class="selected-chat">
      <div class="chat-header" id="chatName">Selecciona un chat</div>
      <div class="chat-messages" id="chatBox"></div>
      <form class="input-area" id="chatForm">
        <input type="text" id="messageInput" placeholder="Escribe un mensaje..." required />
        <button type="submit"><i class="fas fa-paper-plane"></i></button>
      </form>
    </div>

    <script>
      let currentChat = null;

      async function loadChats() {
        const res = await fetch("/api/chats");
        const chats = await res.json();
        const chatList = document.getElementById("chatList");
        chatList.innerHTML = "";

        for (const from in chats) {
          const lastMsg = chats[from].responses[chats[from].responses.length - 1]?.text || "Nuevo cliente";
          const item = document.createElement("div");
          item.className = "chat-item";
          item.innerHTML = `<strong>${from}</strong><br><small>${lastMsg}</small>`;
          item.onclick = () => openChat(from);
          chatList.appendChild(item);
        }
      }

      async function openChat(from) {
        currentChat = from;
        const res = await fetch("/api/chat/" + from);
        const chat = await res.json();
        const chatBox = document.getElementById("chatBox");
        document.getElementById("chatName").innerText = `Cliente: ${from}`;

        chatBox.innerHTML = "";
        if (!chat.responses) return;

        chat.responses.forEach((msg) => {
          const msgDiv = document.createElement("div");
          msgDiv.className = "message " + (msg.from === "cliente" ? "from-client" : "from-bot");
          msgDiv.innerText = msg.text;
          chatBox.appendChild(msgDiv);

          const time = document.createElement("div");
          time.className = "timestamp";
          time.innerText = new Date(msg.timestamp).toLocaleTimeString();
          chatBox.appendChild(time);
        });

        chatBox.scrollTop = chatBox.scrollHeight;
      }

      document.getElementById("chatForm").onsubmit = async (e) => {
        e.preventDefault();
        const message = document.getElementById("messageInput").value.trim();
        if (!message || !currentChat) return;

        const response = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: currentChat, message })
        });

        const result = await response.json();
        if (result.status === "ok") {
          document.getElementById("messageInput").value = "";
          openChat(currentChat);
        }
      };

      window.onload = () => {
        loadChats();
        setInterval(loadChats, 10000);
      };
    </script>
  </body>
</html>

  `;
  res.send(html);
});


// Rutas del monitor web
app.get('/api/chats', (req, res) => {
  res.json(conversations);
});

app.get('/api/chat/:from', (req, res) => {
  const from = req.params.from;
  res.json(conversations[from] || { responses: [] });
});

app.post('/api/send', express.json(), async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) return res.status(400).json({ error: "Faltan datos" });

  try {
    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`, 
      {
        messaging_product: "whatsapp",
        to,
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
        }
      }
    );

    // Registrar mensaje del asesor
    if (!conversations[to]) conversations[to] = { responses: [] };
    conversations[to].responses.push({
      from: 'bot',
      text: message,
      timestamp: new Date()
    });

    res.json({ status: "ok" });

  } catch (err) {
    console.error("🚨 Error al enviar mensaje:", err.message);
    res.json({ status: "error", error: err.message });
  }
});

// Puerto dinámico
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
