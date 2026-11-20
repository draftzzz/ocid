/* Registro de rutas del grupo publicas. */
const express = require('express');
const router = express.Router();
const { authLimiter, departmentCreationLimiter, departmentJoinLimiter, autenticarJWT } = require('../middlewares/auth');
const c0 = require('../controllers/system');
const c1 = require('../controllers/auth');

router.get('/health', c0.getHealth);
router.get('/db-test', c0.getDbtest);
router.post('/login', authLimiter, c1.postLogin);
router.post('/registro', authLimiter, c1.postRegistro);

module.exports = router;
