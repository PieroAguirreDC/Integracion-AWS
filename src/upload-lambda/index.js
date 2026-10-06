const Busboy = require('busboy');

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
    contentType: null,
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
    
    return {
      statusCode: 501,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Analizado correctamente (aún no implementado)',
        filename: archivo.filename,
        contentType: archivo.contentType,
        size: archivo.buffer.length,
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