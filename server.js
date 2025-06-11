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
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
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
    switch(user.state) {
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
    <html>
      <head>
        <meta charset="UTF-8">
        <title>📲 Monitor de Asesores</title>
        <meta http-equiv="refresh" content="10"> <!-- Actualiza cada 10 segundos -->
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', sans-serif; }
          body { height: 100vh; display: flex; background-color: #ece5dd; color: black; }

          .sidebar {
            width: 300px;
            background-color: #128c7e;
            color: white;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            padding: 10px;
          }

          .chat-item {
            background-color: #ffffff;
            color: black;
            padding: 12px;
            margin-bottom: 10px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .chat-item:hover {
            background-color: #dcf8c6;
            transform: scale(1.01);
          }

          .selected-chat {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 20px;
            background-color: #ece5dd;
          }

          .chat-messages {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .message {
            max-width: 70%;
            padding: 12px 16px;
            border-radius: 10px;
            word-wrap: break-word;
            line-height: 1.4em;
          }

          .from-client {
            align-self: flex-start;
            background-color: #ffffff;
            float: left;
            border-top-right-radius: 4px;
            border-bottom-right-radius: 10px;
            border-bottom-left-radius: 10px;
          }

          .from-bot {
            align-self: flex-end;
            background-color: #dcf8c6;
            float: right;
            border-top-left-radius: 4px;
            border-bottom-left-radius: 10px;
            border-bottom-right-radius: 10px;
          }

          .timestamp {
            font-size: 0.7em;
            color: gray;
            text-align: right;
            margin-right: 10px;
          }

          .input-area {
            display: flex;
            gap: 10px;
            padding: 10px;
            background-color: #d9dede;
            border-top: 1px solid #ccc;
          }

          input[type=text] {
            flex: 1;
            padding: 10px;
            border: none;
            border-radius: 5px;
            font-size: 1em;
          }

          button {
            padding: 10px 15px;
            background-color: #25D366;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
          }

          button:hover {
            background-color: #1fa954;
          }
        </style>
      </head>
      <body>
        <div class="sidebar" style="overflow-y:auto;">
          <h2>📞 Clientes</h2>
  `;

  for (const from in conversations) {
    const lastMsg = conversations[from].responses[conversations[from].responses.length - 1]?.text || "Nuevo cliente";
    html += `
      <div class="chat-item" onclick="window.location.href='#${from}'; document.getElementById('${from}').scrollIntoView();">
        <strong>${from}</strong><br />
        <small>${lastMsg}</small>
      </div>`;
  }

  html += `
        </div>

        <div class="selected-chat">
          <h2 id="chatName">Selecciona un chat</h2>
          <div class="chat-messages" id="chatBox"></div>
          <form class="input-area" id="chatForm">
            <input type="text" id="messageInput" placeholder="Escribe tu mensaje..." required />
            <button type="submit">Enviar</button>
          </form>
        </div>

        <script>
          // Cargar conversaciones si se pasa un hash en la URL
          const urlParams = new URLSearchParams(window.location.search);
          const currentChat = window.location.hash.replace('#', '');

          async function loadChats() {
            const response = await fetch("/api/chats");
            const chats = await response.json();

            const container = document.getElementById("chatBox");
            container.innerHTML = "";

            if (!currentChat || !chats[currentChat]) {
              container.innerHTML = "<p>Selecciona un cliente.</p>";
              return;
            }

            const chat = chats[currentChat];
            document.getElementById("chatName").innerText = "Cliente: " + currentChat;

            chat.responses.forEach(msg => {
              const msgDiv = document.createElement("div");
              msgDiv.className = "message " + (msg.from === "cliente" ? "from-client" : "from-bot");
              msgDiv.innerText = msg.text;
              container.appendChild(msgDiv);

              const time = document.createElement("small");
              time.className = "timestamp";
              time.innerText = new Date(msg.timestamp).toLocaleTimeString();
              container.appendChild(time);
            });

            container.scrollTop = container.scrollHeight;
          }

          // Enviar mensaje al cliente
          document.getElementById("chatForm").onsubmit = async (e) => {
            e.preventDefault();
            const message = document.getElementById("messageInput").value.trim();
            if (!message || !currentChat) return;

            await fetch("/api/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ to: currentChat, message })
            });

            document.getElementById("messageInput").value = "";
            loadChats();
          };

          setInterval(loadChats, 10000); // Recargar automáticamente
          window.onload = loadChats;
        </script>
      </body>
    </html>
  `;

  res.send(html);
});

// Puerto dinámico
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
