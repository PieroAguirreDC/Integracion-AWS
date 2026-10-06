const Busboy = require('busboy');

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

const clienteS3 = new S3Client({});

function analizarMultipart(bufferCuerpo, headers) {
  return new Promise((resolve, rechazar) => {
    const tipoContenidoCabecera =
      (headers && (headers['content-type'] || headers['Content-Type'])) || '';

    const busboy = Busboy({
      headers: {
        'content-type': tipoContenidoCabecera,
      },
    });

    let bufferArchivo = null;
    let tipoContenidoArchivo = null;
    let nombreArchivo = null;
    let existeArchivo = false;

    busboy.on('file', (campo, archivo, datos) => {
      if (campo !== 'file') {
        archivo.resume();
        return;
      }

      existeArchivo = true;
      nombreArchivo = datos && datos.filename ? datos.filename : null;
      tipoContenidoArchivo = datos && datos.mimeType ? datos.mimeType : null;

      const chunks = [];
      archivo.on('data', (chunk) => {
        chunks.push(chunk);
      });

      archivo.on('end', () => {
        bufferArchivo = Buffer.concat(chunks);
      });

      archivo.on('error', (error) => {
        rechazar(error);
      });
    });

    busboy.on('error', (error) => {
      rechazar(error);
    });

    busboy.on('finish', () => {
      if (!existeArchivo || !bufferArchivo) {
        rechazar(new Error('No se encontró el campo file en el cuerpo multipart'));
        return;
      }

      resolve({
        buffer: bufferArchivo,
        filename: nombreArchivo,
        contentType: tipoContenidoArchivo,
      });
    });

    busboy.end(bufferCuerpo);
  });
}

function obtenerTipoContenidoDesdeNombre(nombreArchivo) {
  if (!nombreArchivo) {
    return null;
  }

  const punto = nombreArchivo.lastIndexOf('.');
  if (punto < 0 || punto >= nombreArchivo.length - 1) {
    return null;
  }

  const ext = nombreArchivo.slice(punto + 1).toLowerCase();

  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';

  return null;
}

function analizarJsonBase64(cuerpoTexto) {
  let datosParseados;

  try {
    datosParseados = JSON.parse(cuerpoTexto);
  } catch (error) {
    throw new Error('El cuerpo JSON no es válido');
  }

  if (
    !datosParseados ||
    typeof datosParseados.filename !== 'string' ||
    typeof datosParseados.data !== 'string'
  ) {
    throw new Error('JSON no válido: se espera { filename, data }');
  }

  let bufferArchivo;
  try {
    bufferArchivo = Buffer.from(datosParseados.data, 'base64');
  } catch (error) {
    throw new Error('Los datos base64 no son válidos');
  }

  if (bufferArchivo.length === 0) {
    throw new Error('No hay datos en el archivo');
  }

  return {
    buffer: bufferArchivo,
    filename: datosParseados.filename,
    contentType: obtenerTipoContenidoDesdeNombre(datosParseados.filename),
  };
}

function obtenerBufferCuerpo(evento) {
  const cuerpo = evento && evento.body ? evento.body : '';
  if (evento && evento.isBase64Encoded) {
    try {
      return Buffer.from(cuerpo, 'base64');
    } catch (error) {
      throw new Error('El cuerpo base64 no es válido');
    }
  }
  return Buffer.from(cuerpo, 'utf8');
}

function obtenerTipoContenido(headers) {
  if (!headers) {
    return '';
  }
  const tipo = headers['content-type'] || headers['Content-Type'] || '';
  return tipo.toLowerCase();
}

function esTipoContenidoValido(tipoContenido) {
  if (!tipoContenido) {
    return false;
  }

  const tipo = tipoContenido.toLowerCase();

  if (tipo.includes('image/jpeg') || tipo.includes('image/jpg')) {
    return true;
  }
  if (tipo.includes('image/png')) {
    return true;
  }
  if (tipo.includes('image/gif')) {
    return true;
  }
  if (tipo.includes('image/webp')) {
    return true;
  }

  return false;
}

function validarTipoYTamano(archivo) {
  if (!archivo || !archivo.buffer) {
    throw new Error('Archivo no válido');
  }

  const tamanoMaximo = 6 * 1024 * 1024; // 6 MB

  if (archivo.buffer.length > tamanoMaximo) {
    const error = new Error('El archivo supera el tamaño máximo permitido (6 MB)');
    error.codigoEstado = 413;
    throw error;
  }

  if (!esTipoContenidoValido(archivo.contentType)) {
    const error = new Error('Tipo de contenido no compatible');
    error.codigoEstado = 400;
    throw error;
  }

  return archivo;
}

function obtenerExtension(nombreArchivo, tipoContenido) {
  if (nombreArchivo) {
    const punto = nombreArchivo.lastIndexOf('.');
    if (punto >= 0 && punto < nombreArchivo.length - 1) {
      const ext = nombreArchivo.slice(punto + 1).toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp') {
        return ext;
      }
    }
  }

  if (tipoContenido) {
    const tipo = tipoContenido.toLowerCase();
    if (tipo.includes('image/png')) return 'png';
    if (tipo.includes('image/gif')) return 'gif';
    if (tipo.includes('image/webp')) return 'webp';
    if (tipo.includes('image/jpeg') || tipo.includes('image/jpg')) return 'jpg';
  }

  return 'jpg';
}

async function subirArchivoS3(archivo) {
  const bucket = process.env.S3_BUCKET;
  const prefijoSubida = process.env.UPLOAD_PREFIX || 'uploads/';

  if (!bucket) {
    const error = new Error('Variable de entorno S3_BUCKET no configurada');
    error.codigoEstado = 500;
    throw error;
  }

  const id = crypto.randomUUID();
  const extension = obtenerExtension(archivo.filename, archivo.contentType);
  const clave = `${prefijoSubida}${id}.${extension}`;
  const claveProcesada = `processed/${id}_circular.png`;

  const parametros = {
    Bucket: bucket,
    Key: clave,
    Body: archivo.buffer,
  };

  if (archivo.contentType) {
    parametros.ContentType = archivo.contentType;
  }

  try {
    await clienteS3.send(new PutObjectCommand(parametros));
  } catch (error) {
    const err = new Error('Error al guardar el archivo en S3');
    err.codigoEstado = 500;
    throw err;
  }

  return {
    id,
    key: clave,
    processedKey: claveProcesada,
  };
}

exports.handler = async (evento) => {
  try {
    const headers = (evento && evento.headers) || {};
    const tipoContenido = obtenerTipoContenido(headers);

    let archivo;

    if (tipoContenido.includes('multipart/form-data')) {
      const bufferCuerpo = obtenerBufferCuerpo(evento);
      archivo = await analizarMultipart(bufferCuerpo, headers);
    } else if (tipoContenido.includes('application/json')) {
      let cuerpoTexto;
      if (evento && evento.isBase64Encoded) {
        cuerpoTexto = obtenerBufferCuerpo(evento).toString('utf8');
      } else {
        cuerpoTexto = (evento && evento.body) || '';
      }
      archivo = analizarJsonBase64(cuerpoTexto);
    } else {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Tipo de contenido no compatible' }),
      };
    }

    // Validación de tipo y tamaño (solo por content-type)
    try {
      validarTipoYTamano(archivo);
    } catch (errorValidacion) {
      const codigo = errorValidacion.codigoEstado || 400;
      const mensajeValidacion = errorValidacion.message || 'Solicitud incorrecta';
      return {
        statusCode: codigo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: mensajeValidacion }),
      };
    }

    // Guardar imagen original en uploads/
    let resultadoSubida;
    try {
      resultadoSubida = await subirArchivoS3(archivo);
    } catch (errorSubida) {
      const codigo = errorSubida.codigoEstado || 500;
      const mensajeSubida = errorSubida.message || 'Error interno del servidor';
      return {
        statusCode: codigo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: mensajeSubida }),
      };
    }

    return {
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: resultadoSubida.id,
        key: resultadoSubida.key,
        processedKey: resultadoSubida.processedKey,
      }),
    };
    
  } catch (error) {
    const mensaje = error && error.message ? error.message : 'Solicitud incorrecta';
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: mensaje }),
    };
  }
};