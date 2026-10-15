
import { db } from "./firebase.js";

import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://pkbcoyelqegbxbrxefbk.supabase.co";
const SUPABASE_KEY = "sb_publishable_kk9cmEuMm3RdJ11P7stVlA_WYQytzeX";
const SUPABASE_BUCKET = "FOTOS MUEY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let usuarioActual = localStorage.getItem("usuarioActual") || "";
let productos = [];
let perfiles = {};
let filtroActual = "Todos";
let busquedaActual = "";

const seccionLogin = $("seccionLogin");
const plataforma = $("plataforma");

/* TIEMPO LIMITE PARA EVITAR CARGAS INDEFINIDAS */
function conTiempoLimite(promesa, segundos, operacion) {
  let temporizador;

  const limite = new Promise((_, reject) => {
    temporizador = setTimeout(() => {
      reject(new Error(
        `${operacion}: se agotó el tiempo de espera de ${segundos} segundos.`
      ));
    }, segundos * 1000);
  });

  return Promise.race([promesa, limite]).finally(() => {
    clearTimeout(temporizador);
  });
}

function mostrarEstado(texto, elemento = "estado") {
  const destino = $(elemento);
  if (destino) destino.textContent = texto || "";
}

/* INICIO DE SESION Y REGISTRO */
function actualizarPantalla() {
  if (seccionLogin) {
    seccionLogin.hidden = Boolean(usuarioActual);
    seccionLogin.style.display = usuarioActual ? "none" : "block";
  }

  if (plataforma) {
    plataforma.hidden = !usuarioActual;
    plataforma.style.display = usuarioActual ? "block" : "none";
  }

  if (usuarioActual) mostrarPerfil();
}

function registrar() {
  const usuario = $("usuario").value.trim();
  const clave = $("clave").value;

  if (!usuario || !clave) {
    mostrarEstado("Escribe tu usuario y contraseña.", "mensajeLogin");
    return;
  }

  if (clave.length < 4) {
    mostrarEstado("La contraseña debe tener al menos 4 caracteres.", "mensajeLogin");
    return;
  }

  const cuentas = JSON.parse(localStorage.getItem("cuentasMuey") || "{}");

  if (cuentas[usuario]) {
    mostrarEstado("Ese usuario ya existe.", "mensajeLogin");
    return;
  }

  cuentas[usuario] = clave;
  localStorage.setItem("cuentasMuey", JSON.stringify(cuentas));
  localStorage.setItem("usuarioActual", usuario);
  usuarioActual = usuario;

  actualizarPantalla();
  mostrarEstado("Cuenta creada correctamente.", "mensajeLogin");
}

function iniciarSesion() {
  const usuario = $("usuario").value.trim();
  const clave = $("clave").value;
  const cuentas = JSON.parse(localStorage.getItem("cuentasMuey") || "{}");

  if (cuentas[usuario] && cuentas[usuario] === clave) {
    usuarioActual = usuario;
    localStorage.setItem("usuarioActual", usuario);
    actualizarPantalla();
    mostrarEstado("Sesión iniciada.", "mensajeLogin");
  } else {
    mostrarEstado("Datos incorrectos o cuenta no registrada.", "mensajeLogin");
  }
}

function cerrarSesion() {
  usuarioActual = "";
  localStorage.removeItem("usuarioActual");
  actualizarPantalla();
}

if ($("btnRegistrar")) {
  $("btnRegistrar").addEventListener("click", registrar);
}

if ($("btnIngresar")) {
  $("btnIngresar").addEventListener("click", iniciarSesion);
}

if ($("btnCerrarSesion")) {
  $("btnCerrarSesion").addEventListener("click", cerrarSesion);
}

/* COMPRIMIR FOTO */
function comprimirFoto(archivo) {
  return new Promise((resolve, reject) => {
    if (!archivo || !archivo.type.startsWith("image/")) {
      reject(new Error("Selecciona una imagen válida."));
      return;
    }

    const lector = new FileReader();

    lector.onerror = () => reject(new Error("No se pudo leer la foto."));

    lector.onload = () => {
      const imagen = new Image();

      imagen.onerror = () => reject(new Error("La imagen no es válida."));

      imagen.onload = () => {
        try {
          const maximo = 1000;
          const escala = Math.min(
            1,
            maximo / Math.max(imagen.width, imagen.height)
          );

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(imagen.width * escala));
          canvas.height = Math.max(1, Math.round(imagen.height * escala));

          const contexto = canvas.getContext("2d");

          if (!contexto) {
            reject(new Error("No se pudo procesar la imagen."));
            return;
          }

          contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("No se pudo comprimir la foto."));
            },
            "image/jpeg",
            0.75
          );
        } catch (error) {
          reject(error);
        }
      };

      imagen.src = lector.result;
    };

    lector.readAsDataURL(archivo);
  });
}

/* SUBIR FOTO A SUPABASE */
async function subirFoto(archivo, carpeta, informarEstado = () => {}) {
  informarEstado("1/3: Comprimiendo foto...");

  const imagen = await conTiempoLimite(
    comprimirFoto(archivo),
    30,
    "La compresión de la foto"
  );

  const ruta =
    `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  informarEstado("2/3: Subiendo foto a Supabase...");

  const resultado = await conTiempoLimite(
    supabase.storage.from(SUPABASE_BUCKET).upload(ruta, imagen, {
      contentType: "image/jpeg",
      upsert: false
    }),
    30,
    "La subida a Supabase"
  );

  if (resultado.error) {
    throw new Error("Supabase: " + resultado.error.message);
  }

  const { data } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(ruta);

  if (!data?.publicUrl) {
    throw new Error("No se pudo obtener la dirección pública de la foto.");
  }

  return data.publicUrl;
}

/* PANEL DE PERFIL */
const panelPerfil = document.createElement("section");
panelPerfil.className = "panel-perfil";
panelPerfil.style.cssText =
  "display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:15px;margin-bottom:20px;";

panelPerfil.innerHTML = `
  <img id="fotoPerfilActual" alt="Foto de perfil"
    style="width:55px;height:55px;border-radius:50%;object-fit:cover;display:none;">
  <strong id="nombrePerfilActual"></strong>
  <label for="fotoPerfil">Foto de perfil (opcional)</label>
  <input type="file" id="fotoPerfil" accept="image/*">
  <button type="button" id="btnGuardarPerfil">Guardar foto</button>
  <p id="estadoPerfil"></p>
`;

if (plataforma) plataforma.prepend(panelPerfil);

function mostrarPerfil() {
  const nombre = $("nombrePerfilActual");
  const foto = $("fotoPerfilActual");

  if (!nombre || !foto) return;

  nombre.textContent = usuarioActual ? `Usuario: ${usuarioActual}` : "";

  const url = perfiles[usuarioActual]?.foto;

  if (url) {
    foto.src = url;
    foto.style.display = "block";
  } else {
    foto.removeAttribute("src");
    foto.style.display = "none";
  }

  const campoTelefono = $("telefonoPerfil");

  if (campoTelefono && document.activeElement !== campoTelefono) {
    campoTelefono.value = perfiles[usuarioActual]?.telefono || "";
  }
}

/* GUARDAR WHATSAPP */
if ($("btnGuardarTelefono")) {
  $("btnGuardarTelefono").addEventListener("click", async () => {
    if (!usuarioActual) return;

    const campo = $("telefonoPerfil");
    const telefono = campo.value.trim();
    const numero = telefono.replace(/\D/g, "");

    if (!numero || numero.length < 9 || numero.length > 15) {
      mostrarEstado(
        "Escribe un número válido con código de país si corresponde.",
        "estadoTelefono"
      );
      return;
    }

    const boton = $("btnGuardarTelefono");
    boton.disabled = true;
    mostrarEstado("Guardando número...", "estadoTelefono");

    try {
      await conTiempoLimite(
        setDoc(doc(db, "perfiles", usuarioActual), {
          usuario: usuarioActual,
          telefono: numero,
          actualizado: serverTimestamp()
        }, { merge: true }),
        30,
        "El guardado del número en Firebase"
      );

      mostrarEstado("Número de WhatsApp guardado.", "estadoTelefono");
    } catch (error) {
      console.error(error);
      mostrarEstado("Error al guardar: " + error.message, "estadoTelefono");
    } finally {
      boton.disabled = false;
    }
  });
}

/* GUARDAR FOTO DE PERFIL */
if ($("btnGuardarPerfil")) {
  $("btnGuardarPerfil").addEventListener("click", async () => {
    if (!usuarioActual) return;

    const archivo = $("fotoPerfil").files[0];

    if (!archivo) {
      mostrarEstado("Selecciona una foto primero.", "estadoPerfil");
      return;
    }

    const boton = $("btnGuardarPerfil");
    boton.disabled = true;

    try {
      const foto = await subirFoto(
        archivo,
        "perfiles",
        (texto) => mostrarEstado(texto, "estadoPerfil")
      );

      mostrarEstado("Guardando perfil en Firebase...", "estadoPerfil");

      await conTiempoLimite(
        setDoc(doc(db, "perfiles", usuarioActual), {
          usuario: usuarioActual,
          foto,
          actualizado: serverTimestamp()
        }, { merge: true }),
        30,
        "El guardado de la foto en Firebase"
      );

      $("fotoPerfil").value = "";
      mostrarEstado("Foto de perfil guardada.", "estadoPerfil");
    } catch (error) {
      console.error(error);
      mostrarEstado("No se pudo guardar la foto: " + error.message, "estadoPerfil");
    } finally {
      boton.disabled = false;
    }
  });
}

/* CARGAR PERFILES */
onSnapshot(
  collection(db, "perfiles"),
  (resultado) => {
    perfiles = {};

    resultado.docs.forEach((documento) => {
      perfiles[documento.id] = documento.data();
    });

    mostrarPerfil();
    mostrarProductos();
  },
  (error) => {
    console.error("Error cargando perfiles:", error);
    mostrarEstado("Error al cargar perfiles: " + error.message);
  }
);

/* PUBLICAR PRODUCTOS Y SERVICIOS */
if ($("formProducto")) {
  $("formProducto").addEventListener("submit", async (evento) => {
    evento.preventDefault();

    if (!usuarioActual) {
      mostrarEstado("Inicia sesión primero.");
      return;
    }

    const nombre = $("nombre").value.trim();
    const precioTexto = $("precio").value.trim();
    const precio = Number(precioTexto);
    const descripcion = $("descripcion").value.trim();
    const archivo = $("imagen").files[0];
    const categoria = $("categoria").value;

    if (
      !nombre ||
      !precioTexto ||
      !descripcion ||
      !Number.isFinite(precio) ||
      precio < 0
    ) {
      mostrarEstado("Revisa los datos del producto.");
      return;
    }

    if (!archivo) {
      mostrarEstado("Selecciona una foto del producto.");
      return;
    }

    const boton = $("btnPublicar");
    boton.disabled = true;

    try {
      const imagen = await subirFoto(
        archivo,
        "productos",
        (texto) => mostrarEstado(texto)
      );

      mostrarEstado("3/3: Guardando producto en Firebase...");

      await conTiempoLimite(
        addDoc(collection(db, "productos"), {
          nombre,
          precio,
          descripcion,
          imagen,
          categoria,
          vendedor: usuarioActual,
          creado: serverTimestamp()
        }),
        30,
        "El guardado del producto en Firebase"
      );

      $("formProducto").reset();
      mostrarEstado("¡Publicación guardada correctamente!");
    } catch (error) {
      console.error("Error al publicar:", error);
      mostrarEstado("No se pudo publicar: " + error.message);
    } finally {
      boton.disabled = false;
    }
  });
}

/* CARGAR PUBLICACIONES */
onSnapshot(
  collection(db, "productos"),
  (resultado) => {
    productos = resultado.docs.map((documento) => ({
      id: documento.id,
      ...documento.data()
    }));

    productos.sort((a, b) => {
      const fechaA = a.creado?.toMillis?.() || 0;
      const fechaB = b.creado?.toMillis?.() || 0;
      return fechaB - fechaA;
    });

    mostrarProductos();
  },
  (error) => {
    console.error("Error cargando productos:", error);
    mostrarEstado("Error al cargar publicaciones: " + error.message);
  }
);

/* PREPARAR NUMERO DE WHATSAPP */
function prepararNumeroWhatsApp(telefono) {
  let numero = String(telefono || "").replace(/\D/g, "");

  if (numero.startsWith("0")) {
    numero = "593" + numero.slice(1);
  } else if (numero.length === 9 && numero.startsWith("9")) {
    numero = "593" + numero;
  }

  return numero;
}

/* NORMALIZAR TEXTO PARA BUSCAR CON O SIN TILDES */
function normalizarTexto(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/* MOSTRAR PUBLICACIONES */
function mostrarProductos() {
  const lista = $("lista");
  if (!lista) return;

  lista.replaceChildren();

  const encontrados = productos.filter((producto) => {
    const coincideCategoria =
      filtroActual === "Todos" ||
      producto.categoria === filtroActual;

    const textoProducto = normalizarTexto(
      `${producto.nombre || ""} ${producto.descripcion || ""} ${producto.categoria || ""}`
    );

    const coincideBusqueda =
      !busquedaActual ||
      textoProducto.includes(normalizarTexto(busquedaActual));

    return coincideCategoria && coincideBusqueda;
  });

  if (!encontrados.length) {
    const mensaje = document.createElement("p");

    if (busquedaActual) {
      mensaje.textContent = "No se encontraron resultados para tu búsqueda.";
    } else {
      mensaje.textContent = "Todavía no hay publicaciones en esta categoría.";
    }

    lista.appendChild(mensaje);
    return;
  }

  encontrados.forEach((producto) => {
    const tarjeta = document.createElement("article");
    tarjeta.className = "producto";
    tarjeta.style.cssText =
      "max-width:500px;margin:20px auto;background:white;border:1px solid #ddd;border-radius:12px;overflow:hidden;color:#222;";

    const encabezado = document.createElement("div");
    encabezado.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:12px;";

    const perfil = perfiles[producto.vendedor];

    if (perfil?.foto) {
      const avatar = document.createElement("img");
      avatar.src = perfil.foto;
      avatar.alt = "Foto de perfil";
      avatar.style.cssText =
        "width:42px;height:42px;border-radius:50%;object-fit:cover;";
      encabezado.appendChild(avatar);
    }

    const vendedor = document.createElement("strong");
    vendedor.textContent = producto.vendedor || "Usuario";
    encabezado.appendChild(vendedor);
    tarjeta.appendChild(encabezado);

    if (producto.imagen) {
      const foto = document.createElement("img");
      foto.src = producto.imagen;
      foto.alt = producto.nombre || "Foto del producto";
      foto.loading = "lazy";
      foto.style.cssText =
        "display:block;width:100%;max-height:500px;object-fit:contain;background:#f5f5f5;";
      tarjeta.appendChild(foto);
    }

    const contenido = document.createElement("div");
    contenido.style.cssText = "padding:14px;";

    const precio = document.createElement("h3");
    precio.textContent = `$${Number(producto.precio || 0).toFixed(2)}`;
    contenido.appendChild(precio);

    const nombre = document.createElement("strong");
    nombre.textContent = producto.nombre || "Producto";
    contenido.appendChild(nombre);

    const descripcion = document.createElement("p");
    descripcion.textContent = producto.descripcion || "";
    contenido.appendChild(descripcion);

    const categoria = document.createElement("span");
    categoria.textContent = producto.categoria || "Productos";
    contenido.appendChild(categoria);

    tarjeta.appendChild(contenido);

    /* CONTACTAR POR WHATSAPP */
    if (producto.vendedor && producto.vendedor !== usuarioActual) {
      const botonContactar = document.createElement("button");
      botonContactar.type = "button";
      botonContactar.textContent = "💬 Contactar";
      botonContactar.style.cssText =
        "display:block;margin:0 14px 14px;padding:10px 16px;background:#25D366;color:white;border:0;border-radius:8px;cursor:pointer;";

      botonContactar.addEventListener("click", () => {
        const telefono = perfiles[producto.vendedor]?.telefono;

        if (!telefono) {
          alert("Este vendedor todavía no ha registrado su WhatsApp.");
          return;
        }

        const numero = prepararNumeroWhatsApp(telefono);

        if (numero.length < 10 || numero.length > 15) {
          alert("El número de WhatsApp del vendedor no parece válido.");
          return;
        }

        const mensaje = producto.categoria === "Servicios"
          ? `Hola, me interesa tu servicio: ${producto.nombre}. ¿Me das más información?`
          : `Hola, me interesa tu producto: ${producto.nombre}. ¿Está disponible?`;

        window.open(
          `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`,
          "_blank",
          "noopener,noreferrer"
        );
      });

      tarjeta.appendChild(botonContactar);
    }

    /* ELIMINAR PUBLICACIONES PROPIAS */
    if (usuarioActual && producto.vendedor === usuarioActual) {
      const botonEliminar = document.createElement("button");
      botonEliminar.type = "button";
      botonEliminar.textContent = "🗑️ Eliminar publicación";
      botonEliminar.style.cssText =
        "display:block;margin:0 14px 14px;padding:10px 14px;background:#dc2626;color:white;border:0;border-radius:6px;cursor:pointer;";

      botonEliminar.addEventListener("click", async () => {
        if (!confirm(`¿Seguro que quieres eliminar "${producto.nombre}"?`)) return;

        botonEliminar.disabled = true;
        botonEliminar.textContent = "Eliminando...";

        try {
          await conTiempoLimite(
            deleteDoc(doc(db, "productos", producto.id)),
            30,
            "La eliminación del producto"
          );

          mostrarEstado("Publicación eliminada correctamente.");
        } catch (error) {
          console.error(error);
          mostrarEstado("No se pudo eliminar: " + error.message);
          botonEliminar.disabled = false;
          botonEliminar.textContent = "🗑️ Eliminar publicación";
        }
      });

      tarjeta.appendChild(botonEliminar);
    }

    lista.appendChild(tarjeta);
  });
}

/* FILTROS */
if ($("filtro")) {
  $("filtro").addEventListener("change", (evento) => {
    filtroActual = evento.target.value;
    mostrarProductos();
  });
}

/* BUSCADOR DE PRODUCTOS Y SERVICIOS */
if ($("buscador")) {
  $("buscador").addEventListener("input", (evento) => {
    busquedaActual = evento.target.value;
    mostrarProductos();
  });
}

/* INICIAR PLATAFORMA */
actualizarPantalla();
mostrarProductos();
