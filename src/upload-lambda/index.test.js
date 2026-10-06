const test = require('node:test');
const assert = require('node:assert');

// Simula el cliente de S3 sin usar AWS real.
// Se inyecta antes de cargar index.js para que requiera este módulo falso.
const rutaS3 = require.resolve('@aws-sdk/client-s3');
const llamadas = [];

require.cache[rutaS3] = {
  id: rutaS3,
  filename: rutaS3,
  loaded: true,
  children: [],
  parent: null,
  exports: {
    S3Client: class {
      send(comando) {
        llamadas.push(comando);
        return Promise.resolve({});
      }
    },
    PutObjectCommand: class {
      constructor(parametros) {
        this.input = parametros;
      }
    },
  },
};

delete require.cache[require.resolve('./index.js')];
const { handler } = require('./index.js');

const BUCKET_PRUEBA = 'bucket-de-prueba';
const PREFIJO_PRUEBA = 'uploads/';

const BUCKET_ANTERIOR = process.env.S3_BUCKET;
const PREFIJO_ANTERIOR = process.env.UPLOAD_PREFIX;

test.beforeEach(() => {
  process.env.S3_BUCKET = BUCKET_PRUEBA;
  process.env.UPLOAD_PREFIX = PREFIJO_PRUEBA;
  llamadas.length = 0;
});

test.after(() => {
  if (BUCKET_ANTERIOR === undefined) {
    delete process.env.S3_BUCKET;
  } else {
    process.env.S3_BUCKET = BUCKET_ANTERIOR;
  }

  if (PREFIJO_ANTERIOR === undefined) {
    delete process.env.UPLOAD_PREFIX;
  } else {
    process.env.UPLOAD_PREFIX = PREFIJO_ANTERIOR;
  }
});

// Construye un evento real de multipart/form-data con las APIs de Node 20.
async function construirMultipart(buffer, nombre, tipo) {
  const datos = new FormData();
  datos.append('file', new Blob([buffer], { type: tipo }), nombre);

  const respuesta = new Response(datos);
  const cuerpo = Buffer.from(await respuesta.arrayBuffer());

  return {
    headers: {
      'content-type': respuesta.headers.get('content-type'),
    },
    body: cuerpo.toString('base64'),
    isBase64Encoded: true,
  };
}

function obtenerCuerpo(respuesta) {
  return JSON.parse(respuesta.body);
}

const PNG_VALIDO = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('contenido-de-prueba'),
]);

test('multipart válido responde 201 con las tres claves', async () => {
  const evento = await construirMultipart(PNG_VALIDO, 'foto.png', 'image/png');

  const respuesta = await handler(evento);
  const cuerpo = obtenerCuerpo(respuesta);

  assert.strictEqual(respuesta.statusCode, 201);
  assert.match(cuerpo.id, /^[0-9a-f-]{36}$/i);
  assert.strictEqual(cuerpo.key, `${PREFIJO_PRUEBA}${cuerpo.id}.png`);
  assert.strictEqual(cuerpo.processedKey, `processed/${cuerpo.id}_circular.png`);
});

test('multipart válido sube el archivo con Bucket, Key y ContentType correctos', async () => {
  const evento = await construirMultipart(PNG_VALIDO, 'foto.png', 'image/png');

  const respuesta = await handler(evento);
  const cuerpo = obtenerCuerpo(respuesta);

  assert.strictEqual(llamadas.length, 1);

  const parametros = llamadas[0].input;
  assert.strictEqual(parametros.Bucket, BUCKET_PRUEBA);
  assert.strictEqual(parametros.Key, `${PREFIJO_PRUEBA}${cuerpo.id}.png`);
  assert.strictEqual(parametros.ContentType, 'image/png');
  assert.ok(Buffer.isBuffer(parametros.Body));
  assert.strictEqual(parametros.Body.length, PNG_VALIDO.length);
});

test('JSON base64 válido responde 201 con la extensión del filename', async () => {
  const evento = {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: 'foto.png',
      data: PNG_VALIDO.toString('base64'),
    }),
    isBase64Encoded: false,
  };

  const respuesta = await handler(evento);
  const cuerpo = obtenerCuerpo(respuesta);

  assert.strictEqual(respuesta.statusCode, 201);
  assert.match(cuerpo.id, /^[0-9a-f-]{36}$/i);
  assert.strictEqual(cuerpo.key, `${PREFIJO_PRUEBA}${cuerpo.id}.png`);
  assert.strictEqual(cuerpo.processedKey, `processed/${cuerpo.id}_circular.png`);
  assert.strictEqual(llamadas[0].input.ContentType, 'image/png');
});

test('tipo de contenido no compatible responde 400', async () => {
  const evento = {
    headers: { 'content-type': 'application/pdf' },
    body: 'contenido-en-texto-plano',
    isBase64Encoded: false,
  };

  const respuesta = await handler(evento);
  const cuerpo = obtenerCuerpo(respuesta);

  assert.strictEqual(respuesta.statusCode, 400);
  assert.strictEqual(cuerpo.error, 'Tipo de contenido no compatible');
  assert.strictEqual(llamadas.length, 0);
});

test('JSON inválido responde 400', async () => {
  const evento = {
    headers: { 'content-type': 'application/json' },
    body: 'esto no es un json',
    isBase64Encoded: false,
  };

  const respuesta = await handler(evento);
  const cuerpo = obtenerCuerpo(respuesta);

  assert.strictEqual(respuesta.statusCode, 400);
  assert.strictEqual(cuerpo.error, 'El cuerpo JSON no es válido');
  assert.strictEqual(llamadas.length, 0);
});

test('JSON sin los campos filename y data responde 400', async () => {
  const evento = {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: 'foto.png' }),
    isBase64Encoded: false,
  };

  const respuesta = await handler(evento);
  const cuerpo = obtenerCuerpo(respuesta);

  assert.strictEqual(respuesta.statusCode, 400);
  assert.strictEqual(cuerpo.error, 'JSON no válido: se espera { filename, data }');
  assert.strictEqual(llamadas.length, 0);
});

test('imagen con tipo no permitido en multipart responde 400', async () => {
  const evento = await construirMultipart(
    Buffer.from('<svg></svg>'),
    'dibujo.svg',
    'image/svg+xml'
  );

  const respuesta = await handler(evento);
  const cuerpo = obtenerCuerpo(respuesta);

  assert.strictEqual(respuesta.statusCode, 400);
  assert.strictEqual(cuerpo.error, 'Tipo de contenido no compatible');
  assert.strictEqual(llamadas.length, 0);
});

test('archivo mayor a 6 MB responde 413', async () => {
  const bufferGrande = Buffer.alloc(6 * 1024 * 1024 + 1, 0x41);
  const evento = await construirMultipart(bufferGrande, 'grande.png', 'image/png');

  const respuesta = await handler(evento);
  const cuerpo = obtenerCuerpo(respuesta);

  assert.strictEqual(respuesta.statusCode, 413);
  assert.strictEqual(
    cuerpo.error,
    'El archivo supera el tamaño máximo permitido (6 MB)'
  );
  assert.strictEqual(llamadas.length, 0);
});
