/* Punto de entrada MVC: configuracion, middlewares, rutas y arranque. */
const express = require('express');
const cors = require('cors');

const { PORT } = require('./config/environment');
const { autenticarJWT } = require('./middlewares/auth');

const app = express();

// CORRECCIÓN OBLIGATORIA PARA RENDER: Confiar en el proxy de Render
app.set('trust proxy', 1);

const corsOptions = {
  origin(origin, callback) {
    const origenPermitido = !origin ||
      [
        'https://ocid-nine.vercel.app',
        'https://ocid.onrender.com'
      ].includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    callback(null, origenPermitido);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json({ limit: '15mb' }));

app.use(require('./routes/public'));
app.use(autenticarJWT);
app.use(require('./routes/private'));

// Manejo de rutas no encontradas (404)
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor OCID funcionando en el puerto ${PORT}`);
});

module.exports = app;
