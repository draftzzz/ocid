/* Registro de rutas del grupo privadas. */
const express = require('express');
const router = express.Router();
const {
  authLimiter, departmentCreationLimiter, departmentJoinLimiter, autenticarJWT,
  soloBorradoParaAdministradores
} = require('../middlewares/auth');
const c0 = require('../controllers/identidad');
const c1 = require('../controllers/departamentos');
const c2 = require('../controllers/anuncios');
const c3 = require('../controllers/summary');
const c4 = require('../controllers/archivos');
const c5 = require('../controllers/tareas');
const c6 = require('../controllers/notificaciones');

router.get('/perfil', c0.getPerfil);
router.get('/usuarios', c0.getUsuarios);
router.get('/docentes', c0.getDocentes);
router.get('/departamentos/:id/roles', c1.getDepartamentosidroles);
router.post('/departamentos/:id/roles', soloBorradoParaAdministradores, c1.postDepartamentosidroles);
router.delete('/departamentos/:id/roles/:rolId', soloBorradoParaAdministradores, c1.deleteDepartamentosidrolesrolId);
router.patch('/usuarios/:id/rol', soloBorradoParaAdministradores, c0.patchUsuariosidrol);
router.patch('/usuarios/:id/estado', soloBorradoParaAdministradores, c0.patchUsuariosidestado);
router.put('/usuarios/:id', c0.putUsuariosid);
router.patch('/usuarios/:id/salir-departamento', c0.patchUsuariosidsalirdepartamento);
router.patch('/usuarios/:id/password', c0.patchUsuariosidpassword);
router.delete('/usuarios/:id', soloBorradoParaAdministradores, c0.deleteUsuariosid);
router.get('/anuncios/papelera', c2.getAnunciospapelera);
router.get('/anuncios', c2.getAnuncios);
router.post('/anuncios', soloBorradoParaAdministradores, c2.postAnuncios);
router.put('/anuncios/:id', soloBorradoParaAdministradores, c2.putAnunciosid);
router.delete('/anuncios/:id', c2.deleteAnunciosid);
router.put('/anuncios/:id/restaurar', soloBorradoParaAdministradores, c2.putAnunciosidrestaurar);
router.delete('/anuncios/:id/permanente', soloBorradoParaAdministradores, c2.deleteAnunciosidpermanente);
router.get('/api/stats', c3.getApistats);
router.get('/api/departamentos-con-conteo', c3.getApidepartamentosconconteo);
router.get('/archivos/papelera', c4.getArchivospapelera);
router.get('/archivos', c4.getArchivos);
router.get('/archivos/:id', c4.getArchivosid);
router.post('/archivos', soloBorradoParaAdministradores, c4.postArchivos);
router.put('/archivos/:id', soloBorradoParaAdministradores, c4.putArchivosid);
router.delete('/archivos/:id', c4.deleteArchivosid);
router.put('/archivos/:id/restaurar', soloBorradoParaAdministradores, c4.putArchivosidrestaurar);
router.delete('/archivos/:id/permanente', soloBorradoParaAdministradores, c4.deleteArchivosidpermanente);
router.get('/tareas', c5.getTareas);
router.post('/tareas', soloBorradoParaAdministradores, c5.postTareas);
router.put('/tareas/:id', soloBorradoParaAdministradores, c5.putTareasid);
router.delete('/tareas/:id', c5.deleteTareasid);
router.get('/tareas/papelera', c5.getTareaspapelera);
router.put('/tareas/:id/restaurar', soloBorradoParaAdministradores, c5.putTareasidrestaurar);
router.delete('/tareas/:id/permanente', soloBorradoParaAdministradores, c5.deleteTareasidpermanente);
router.get('/departamentos', c1.getDepartamentos);
router.get('/departamentos/codigo/:codigo', c1.getDepartamentoscodigocodigo);
router.post('/departamentos/unirse', autenticarJWT, departmentJoinLimiter, c1.postDepartamentosunirse);
router.post('/departamentos', departmentCreationLimiter, soloBorradoParaAdministradores, c1.postDepartamentos);
router.put('/departamentos/:id', soloBorradoParaAdministradores, c1.putDepartamentosid);
router.patch('/departamentos/:id/transferir-jefatura', soloBorradoParaAdministradores, c1.patchDepartamentosidtransferirjefatura);
router.delete('/departamentos/:id', soloBorradoParaAdministradores, c1.deleteDepartamentosid);
router.get('/notificaciones', c6.getNotificaciones);
router.post('/elementos/:tipo/:id/visto', c6.postElementostipoidvisto);
router.put('/notificaciones/:id/leer', c6.putNotificacionesidleer);
router.delete('/notificaciones/:id', c6.deleteNotificacionesid);

module.exports = router;
