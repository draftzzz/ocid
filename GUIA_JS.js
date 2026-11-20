/* Guía sencilla de JavaScript y librerías usadas en OCID. */
/* Este archivo NO se carga en la aplicación: solo sirve para leer y aprender. */

(function guiaJavaScript() {
  'use strict';

  const linea = '----------------------------------------';

  // 1. Promise: una "promesa" de que algo llegará después
  function esperarUnPoco(milisegundos) {
    return new Promise(resolve => setTimeout(resolve, milisegundos));
  }

  // 2. async / await: esperar la promesa sin trabar todo el programa
  async function ejemploAsyncAwait() {
    console.log(linea, 'async / await');
    console.log('1. Empiezo a cargar notificaciones...');
    await esperarUnPoco(10);
    console.log('2. Ya llegaron las notificaciones.');
  }

  // 3. fetch: el mensajero que va a la API y trae la respuesta
  function ejemploFetch() {
    console.log(linea, 'fetch');
    // En la app real: await fetch('https://ocid.onrender.com/notificaciones')
    // fetch devuelve una Promise, por eso se usa con await.
    console.log('fetch(envio, opciones) -> Promise<Response>');
  }

  // 4. try / catch / finally: la red de seguridad cuando algo falla
  function ejemploTryCatch() {
    console.log(linea, 'try / catch');
    try {
      const usuario = JSON.parse('{"nombre":"Ana"}');
      console.log('Usuario leído:', usuario.nombre);
    } catch (error) {
      console.log('Hubo un error al leer:', error.message);
    } finally {
      console.log('Esto siempre se ejecuta.');
    }
  }

  // 5. Pool (de la librería pg): no es JS puro, es una clase de Node
  function ejemploPool() {
    console.log(linea, 'Pool');
    // Un Pool es como tener varios mensajeros listos para hablar con PostgreSQL.
    // En vez de abrir y cerrar una conexión por cada petición, se reutilizan.
    /*
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const resultado = await pool.query('SELECT * FROM anuncios WHERE id = $1', [1]);
    */
    console.log('Pool -> muchas consultas, conexiones reutilizadas.');
  }

  // 6. localStorage: la mochila del navegador
  function ejemploLocalStorage() {
    console.log(linea, 'localStorage');
    if (typeof localStorage === 'undefined') {
      console.log('localStorage solo existe dentro del navegador.');
      return;
    }
    localStorage.setItem('demo_ocid', JSON.stringify({ nombre: 'Ana', rol: 'Docente' }));
    const guardado = localStorage.getItem('demo_ocid');
    console.log('Guardado:', guardado);
    localStorage.removeItem('demo_ocid');
  }

  // 7. JSON: empaquetar y desempaquetar datos
  function ejemploJSON() {
    console.log(linea, 'JSON');
    const usuario = { id: 1, nombre: 'Ana' };
    const texto = JSON.stringify(usuario);
    const objeto = JSON.parse(texto);
    console.log('stringify:', texto);
    console.log('parse:', objeto.nombre);
  }

  // 8. Funciones flecha: forma corta de escribir funciones
  function ejemploFlecha() {
    console.log(linea, 'funciones flecha');
    const saludar = nombre => `Hola, ${nombre}`;
    const sumar = (a, b) => a + b;
    console.log(saludar('Ana'), sumar(2, 3));
  }

  // 9. Template literals: texto con huecos ${...}
  function ejemploPlantillas() {
    console.log(linea, 'template literals');
    const rol = 'Jefe';
    console.log(`Mi rol es ${rol} y 2 + 2 = ${2 + 2}`);
  }

  // 10. Destructuring: sacar pedazos de un objeto directamente
  function ejemploDestructuring() {
    console.log(linea, 'destructuring');
    const usuario = { id: 7, rol: 'Docente', nombre: 'Luis' };
    const { id, rol } = usuario;
    console.log('id:', id, 'rol:', rol);
  }

  // 11. Spread: copiar y agregar cosas sin modificar el original
  function ejemploSpread() {
    console.log(linea, 'spread');
    const base = { metodo: 'GET', headers: { 'Content-Type': 'application/json' } };
    const peticion = { ...base, headers: { ...base.headers, Authorization: 'Bearer token' } };
    console.log('Nueva petición:', peticion.headers.Authorization);
  }

  // 12. Optional chaining y nullish coalescing: preguntar sin miedo
  function ejemploOpcional() {
    console.log(linea, '?. y ??');
    const usuario = { nombre: 'Ana' };
    console.log('Departamento:', usuario.departamento?.nombre ?? 'Sin departamento');
  }

  // 13. Métodos de arreglos: map, filter, find, some, forEach
  function ejemploArreglos() {
    console.log(linea, 'arreglos');
    const tareas = [
      { titulo: 'Aviso', lista: true },
      { titulo: 'Informe', lista: false }
    ];
    console.log('map:', tareas.map(t => t.titulo));
    console.log('filter:', tareas.filter(t => t.lista).length);
    console.log('find:', (tareas.find(t => t.titulo === 'Informe') || {}).titulo);
    console.log('some:', tareas.some(t => !t.lista));
    tareas.forEach(t => console.log('tarea:', t.titulo));
  }

  // 14. Promise.all: varias promesas al mismo tiempo
  async function ejemploPromiseAll() {
    console.log(linea, 'Promise.all');
    const [a, b] = await Promise.all([esperarUnPoco(5), esperarUnPoco(5)]);
    console.log('Ambas terminaron:', a, b);
  }

  // 15. DOM: crear y poner elementos en la página (solo en navegador)
  function ejemploDOM() {
    console.log(linea, 'DOM');
    if (typeof document === 'undefined') {
      console.log('document solo existe dentro del navegador.');
      return;
    }
    const tarjeta = document.createElement('div');
    tarjeta.className = 'tarjeta_estado_vacio';
    tarjeta.textContent = 'Aún no has recibido notificaciones.';
    document.body.appendChild(tarjeta);
    console.log('Tarjeta creada con createElement y appendChild.');
  }

  // 16. addEventListener y DOMContentLoaded: escuchar eventos
  function ejemploEventos() {
    console.log(linea, 'eventos');
    if (typeof document === 'undefined') return;
    document.addEventListener('DOMContentLoaded', () => {
      console.log('La página ya está lista para usar.');
    });
  }

  // 17. WeakSet: lista especial que no impide limpiar elementos olvidados
  function ejemploWeakSet() {
    console.log(linea, 'WeakSet');
    const vistos = new WeakSet();
    const boton = {};
    if (!vistos.has(boton)) {
      vistos.add(boton);
      console.log('Ya configuré este botón una sola vez.');
    }
  }

  // 18. new URL: construir rutas sin pegar textos a mano
  function ejemploURL() {
    console.log(linea, 'new URL');
    const ruta = new URL('../..', 'https://ocid.onrender.com/js/controllers/route-guard.js');
    console.log('Ruta calculada:', ruta.pathname);
  }

  // 19. Middleware y Router (Express): filas y letreros del servidor
  function ejemploExpress() {
    console.log(linea, 'Express');
    // Middleware = revisión intermedia: app.use(autenticarJWT)
    // Router = letrero que dice qué controlador atiende cada ruta.
    console.log('app.use(router) -> /ruta -> controlador -> respuesta JSON');
  }

  // 20. jwt y bcrypt: credenciales y candado de contraseñas
  function ejemploSeguridad() {
    console.log(linea, 'jwt / bcrypt');
    // jwt.sign({ id, rol }, SECRETO, { expiresIn: '8h' }) -> crea credencial
    // jwt.verify(token, SECRETO) -> revisa si la credencial sigue sirviendo
    // bcrypt.hash(password, 10) -> guarda contraseña encriptada
    // bcrypt.compare(password, hash) -> compara sin guardar la contraseña original
    console.log('jwt firma y verifica; bcrypt hashea y compara.');
  }

  ejemploAsyncAwait()
    .then(ejemploFetch)
    .then(ejemploTryCatch)
    .then(ejemploPool)
    .then(ejemploLocalStorage)
    .then(ejemploJSON)
    .then(ejemploFlecha)
    .then(ejemploPlantillas)
    .then(ejemploDestructuring)
    .then(ejemploSpread)
    .then(ejemploOpcional)
    .then(ejemploArreglos)
    .then(ejemploPromiseAll)
    .then(ejemploDOM)
    .then(ejemploEventos)
    .then(ejemploWeakSet)
    .then(ejemploURL)
    .then(ejemploExpress)
    .then(ejemploSeguridad)
    .catch(error => console.error('Error en la guía:', error));
})();
