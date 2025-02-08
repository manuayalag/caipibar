// ---------------------
// Importar librerías
// ---------------------
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const xlsx = require('xlsx');
const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

// ---------------------
// Configuración de Express
// ---------------------
app.use(cors()); // Enable CORS
app.use(express.json());
app.use(express.static('public'));  // Sirve archivos estáticos de la carpeta "public"

// Endpoint: Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const filePath = 'pedidos.xlsx';
  if (!fs.existsSync(filePath)) {
    return res.json({ success: false });
  }
  const workbook = xlsx.readFile(filePath);
  const worksheet = workbook.Sheets['Usuarios'];
  console.log(worksheet);
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  const users = data.slice(1).map(row => ({
    username: row[1],
    password: row[2],
    name: row[1]
  }));
  console.log(users);
  const user = users.find(u => u.username == username && u.password == password);
  if (user) {
    res.json({ success: true, user: user.name });
  } else {
    res.json({ success: false });
  }
});

// Endpoint: Obtener pedidos (se leen desde el Excel)
app.get('/orders', (req, res) => {
    const filePath = 'pedidos.xlsx';
    if (!fs.existsSync(filePath)) {
        return res.json([]);
    }
    const workbook = xlsx.readFile(filePath);
    const worksheet = workbook.Sheets['Pedidos'];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    if (data.length < 2) return res.json([]);
    const orders = data.slice(1).map(row => {
        return {
            id: row[0],
            producto: row[1],
            litros: row[2],
            metodo_pago: row[3],
            nombre: row[4],
            numero_cliente: row[5],
            fecha_pedido: row[6],
            estado: row[7],
            fecha_preparacion: row[8],
            fecha_terminado: row[9],
            usuario: row[10] // Add the "Usuario" field
        }
    });
    res.json(orders);
});

// Endpoint: Actualizar el estado de un pedido
app.post('/orders/:id/status', (req, res) => {
    const id = req.params.id;
    const newStatus = req.body.estado; // Ej.: "En Preparación" o "Terminado"
    const updatedBy = req.body.updatedBy;
    if (!newStatus || !updatedBy) {
        return res.status(400).json({ error: "No se especificó el nuevo estado o el usuario" });
    }
    const updatedFields = {};
    updatedFields.Estado = newStatus;
    updatedFields["Actualizado Por"] = updatedBy;
    if (newStatus === "En Preparación") {
        updatedFields["Fecha Preparación"] = new Date().toLocaleString();
    }
    if (newStatus === "Terminado") {
        updatedFields["Fecha Terminado"] = new Date().toLocaleString();
    }
    const success = actualizarPedidoEnExcel(id, updatedFields);
    if (success) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Pedido no encontrado" });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Dashboard corriendo en http://192.168.0.8:${port}`);
});

// ---------------------
// Funciones para trabajar con Excel
// ---------------------

// Función para guardar un pedido nuevo en Excel
function guardarPedidoEnExcel(pedido) {
    const filePath = 'pedidos.xlsx';
    const HEADER = ['ID Pedido', 'Producto', 'Litros', 'Método de Pago', 'Nombre', 'Número de Cliente', 'Fecha Pedido', 'Estado', 'Fecha Preparación', 'Fecha Terminado', 'Usuario'];
    let workbook;
    let worksheet;
    if (fs.existsSync(filePath)) {
        workbook = xlsx.readFile(filePath);
        worksheet = workbook.Sheets['Pedidos'];
    } else {
        workbook = xlsx.utils.book_new();
        worksheet = xlsx.utils.aoa_to_sheet([HEADER]);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Pedidos');
    }
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    data.push([
        pedido.id_pedido,
        pedido.producto,
        pedido.litros,
        pedido.metodo_pago,
        pedido.nombre,
        pedido.numero_cliente,
        new Date().toLocaleString(),  // Fecha Pedido
        "Pendiente",                  // Estado
        "",                           // Fecha Preparación
        "",                           // Fecha Terminado
        ""                            // Usuario
    ]);
    const newWorksheet = xlsx.utils.aoa_to_sheet(data);
    workbook.Sheets['Pedidos'] = newWorksheet;
    xlsx.writeFile(workbook, filePath);
    console.log('✅ Pedido guardado en pedidos.xlsx');
}

// Función para actualizar un pedido existente en Excel
function actualizarPedidoEnExcel(id, updatedFields) {
    const filePath = 'pedidos.xlsx';
    if (!fs.existsSync(filePath)) {
        console.error("El archivo de pedidos no existe");
        return false;
    }
    let workbook = xlsx.readFile(filePath);
    let worksheet = workbook.Sheets['Pedidos'];
    let data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    const header = data[0];
    let updated = false;
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] == id) {
            if (updatedFields.Estado) {
                const colIndex = header.indexOf("Estado");
                data[i][colIndex] = updatedFields.Estado;
            }
            if (updatedFields["Fecha Preparación"]) {
                const colIndex = header.indexOf("Fecha Preparación");
                data[i][colIndex] = updatedFields["Fecha Preparación"];
            }
            if (updatedFields["Fecha Terminado"]) {
                const colIndex = header.indexOf("Fecha Terminado");
                data[i][colIndex] = updatedFields["Fecha Terminado"];
            }
            if (updatedFields["Actualizado Por"]) {
                const colIndex = header.indexOf("Usuario");
                data[i][colIndex] = updatedFields["Actualizado Por"];
            }
            updated = true;
            break;
        }
    }
    if (updated) {
        const newWorksheet = xlsx.utils.aoa_to_sheet(data);
        workbook.Sheets['Pedidos'] = newWorksheet;
        xlsx.writeFile(workbook, filePath);
        console.log("✅ Pedido actualizado en pedidos.xlsx");
    } else {
        console.error("Pedido no encontrado");
    }
    return updated;
}

// ---------------------
// Bot de WhatsApp
// ---------------------
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Bot listo para recibir pedidos!');
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    client.initialize();
});

// Objeto para guardar pedidos en memoria (durante el flujo de conversación)
const pedidos = {};

client.on('message', async msg => {
    // Ignorar mensajes de grupos
    if (msg.isGroupMsg) return;
    
    const chatId = msg.from;
    const phoneNumber = chatId.split('@')[0]; // Extraer solo el número de teléfono
    const userMessage = msg.body.toLowerCase();
    
    if (!pedidos[chatId]) {
        // Asignamos un ID único (usando Date.now()) y el número de cliente (phoneNumber)
        pedidos[chatId] = { estado: "inicio", id_pedido: Date.now().toString(), numero_cliente: phoneNumber };
    }
    
    const pedido = pedidos[chatId];
    
    if (pedido.estado === "inicio") {
        client.sendMessage(chatId, 
            "🍹 *Bienvenido a Caipibar!* ¿Qué desea pedir hoy?\n" +
            "1️⃣ Caipirinha\n2️⃣ Caipiruva\n3️⃣ Caipiboom"
        );
        pedido.estado = "seleccion_producto";
    } else if (pedido.estado === "seleccion_producto") {
        if (["1", "2", "3"].includes(userMessage)) {
            pedido.producto = ["Caipirinha", "Caipiruva", "Caipiboom"][parseInt(userMessage) - 1];
            pedido.estado = "seleccion_litros";
            client.sendMessage(chatId, "¿Cuántos litros?\n1️⃣ 1 litro\n2️⃣ 2 litros");
        } else {
            client.sendMessage(chatId, "Por favor, elija una opción válida (1, 2 o 3).");
        }
    } else if (pedido.estado === "seleccion_litros") {
        if (["1", "2"].includes(userMessage)) {
            pedido.litros = `${userMessage} litro(s)`;
            pedido.estado = "seleccion_pago";
            client.sendMessage(chatId, "¿Método de pago?\n1️⃣ Transferencia\n2️⃣ Efectivo");
        } else {
            client.sendMessage(chatId, "Seleccione 1 o 2 litros.");
        }
    } else if (pedido.estado === "seleccion_pago") {
        if (["1", "2"].includes(userMessage)) {
            pedido.metodo_pago = userMessage === "1" ? "Transferencia" : "Efectivo";
            pedido.estado = "pedir_nombre";
            client.sendMessage(chatId, "📌 ¿Cuál es su nombre y apellido?");
        } else {
            client.sendMessage(chatId, "Seleccione una opción válida (1 o 2).");
        }
    } else if (pedido.estado === "pedir_nombre") {
        pedido.nombre = msg.body;
        pedido.estado = "finalizado";
        client.sendMessage(chatId, 
            `✅ ¡Pedido confirmado!\n\n📝 *Resumen del pedido:*\n` +
            `🍹 Producto: ${pedido.producto}\n📦 Cantidad: ${pedido.litros}\n💰 Pago: ${pedido.metodo_pago}\n👤 Cliente: ${pedido.nombre}\n📞 Número: ${pedido.numero_cliente}\n\n` +
            `Puede pasar a abonar al retirar su pedido. ¡Gracias por elegir Caipibar! 🍹`
        );
        guardarPedidoEnExcel(pedido);
        delete pedidos[chatId]; // Resetear el flujo del pedido para ese chat
    }
});

client.initialize().catch(err => {
    console.error('Failed to initialize client:', err);
});
