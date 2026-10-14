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

/* TIEMPO LIMITE */
function conTiempoLimite(promesa, segundos, operacion) {
  let temporizador;

  const limite = new Promise((_, reject) => {
    temporizador = setTimeout(() => {
      reject(new Error(
        `${operacion} tardó más de ${segundos} segundos. Revisa tu conexión y la configuración del servicio.`
      ));
    }, segundos * 1000);
  });

  return Promise.race([promesa, limite]).finally(() => {
    clearTimeout(temporizador);
  });
}

/* MENSAJES */
function mostrarEstado(texto) {
  const estado = $("estado");
  if (estado) estado.textContent = texto || "";
}

/* REGISTRO */
async function registrar() {
  const usuario = $("usuario").value.trim();
  const clave = $("clave").value;

  if (!usuario || !clave) {
    $("mensajeLogin").textContent = "Escribe tu usuario y contraseña.";
    return;
  }

  if (clave.length < 4) {
    $("mensajeLogin").textContent =
      "La contraseña debe tener al menos 4 caracteres.";
    return;
  }

  const cuentas = JSON.parse(localStorage.getItem("cuentasMuey") || "{}");

  if (cuentas[usuario]) {
    $("mensajeLogin").textContent = "Ese usuario ya existe.";
    return;
  }

  cuentas[usuario] = clave;
  localStorage.setItem("cuentasMuey", JSON.stringify(cuentas));

  usuarioActual = usuario;
  localStorage.setItem("usuarioActual", usuario);

  actualizarPantalla();
}

/* INICIAR SESION */
async function iniciarSesion() {
  const usuario = $("usuario").value.trim();
  const clave = $("clave").value;

  const cuentas = JSON.parse(localStorage.getItem("cuentasMuey") || "{}");

  if (!cuentas[usuario] || cuentas[usuario] !== clave) {
    $("mensajeLogin").textContent = "Datos incorrectos.";
    return;
  }

  usuarioActual = usuario;
  localStorage.setItem("usuarioActual", usuario);

  actualizarPantalla();
}

/* CERRAR SESION */
function cerrarSesion() {
  usuarioActual = "";
  localStorage.removeItem("usuarioActual");
  actualizarPantalla();
}

/* PANTALLA */
function actualizarPantalla() {
  const login = $("seccionLogin");
  const plataforma = $("plataforma");

  if (login) login.style.display = usuarioActual ? "none" : "block";
  if (plataforma) plataforma.style.display = usuarioActual ? "block" : "none";

  if (usuarioActual) mostrarPerfil();
}

/* COMPRIMIR FOTO */
function comprimirFoto(archivo) {
  return new Promise((resolve, reject) => {
    if (!archivo) {
      reject(new Error("Selecciona una foto."));
      return;
    }

    const lector = new FileReader();

    lector.onerror = () =>
      reject(new Error("No se pudo leer la foto."));

    lector.onload = () => {
      const img = new Image();

      img.onerror = () =>
        reject(new Error("El archivo seleccionado no es una imagen válida."));

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const maximo = 1200;

          let ancho = img.width;
          let alto = img.height;

          if (ancho > alto && ancho > maximo) {
            alto = Math.round(alto * maximo / ancho);
            ancho = maximo;
          } else if (alto >= ancho && alto > maximo) {
            ancho = Math.round(ancho * maximo / alto);
            alto = maximo;
          }

          canvas.width = ancho;
          canvas.height = alto;

          const contexto = canvas.getContext("2d");

          if (!contexto) {
            reject(new Error("No se pudo procesar la foto."));
            return;
          }

          contexto.drawImage(img, 0, 0, ancho, alto);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("No se pudo comprimir la foto."));
                return;
              }

              resolve(blob);
            },
            "image/jpeg",
            0.75
          );
        } catch (error) {
          reject(error);
        }
      };

      img.src = lector.result;
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
    "La subida de la foto a Supabase"
  );

  if (resultado.error) {
    throw new Error("Supabase: " + resultado.error.message);
  }

  const { data } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(ruta);

  if (!data?.publicUrl) {
    throw new Error("No se obtuvo la dirección pública de la foto.");
  }

  return data.publicUrl;
}

/* PERFIL */
function mostrarPerfil() {
  let panel = $("panelPerfil");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "panelPerfil";

    const plataforma = $("plataforma");
    if (!plataforma) return;

    plataforma.prepend(panel);
  }

  const perfil = perfiles[usuarioActual] || {};

  panel.innerHTML = `
    <h3>Mi perfil: ${escaparHTML(usuarioActual)}</h3>
    <div>
      ${
        perfil.foto
          ? `<img src="${escaparHTML(perfil.foto)}" alt="Foto de perfil"
              style="width:70px;height:70px;object-fit:cover;border-radius:50%">`
          : ""
      }
    </div>
    <label>Mi número de WhatsApp</label>
    <input id="telefonoPerfil" type="tel" placeholder="Ej. 593999999999"
      value="${escaparHTML(perfil.telefono || "")}">
    <button id="btnGuardarTelefono" type="button">Guardar WhatsApp</button>
    <p id="estadoTelefono"></p>
    <label>Foto de perfil</label>
    <input id="fotoPerfil" type="file" accept="image/*">
    <button id="btnGuardarPerfil" type="button">Guardar foto</button>
    <p id="estadoPerfil"></p>
  `;

  $("btnGuardarTelefono").onclick = guardarTelefono;
  $("btnGuardarPerfil").onclick = guardarFotoPerfil;
}

/* GUARDAR TELEFONO */
async function guardarTelefono() {
  const telefono = $("telefonoPerfil").value.trim();
  const estado = $("estadoTelefono");

  if (!telefono) {
    estado.textContent = "Escribe tu número de WhatsApp.";
    return;
  }

  try {
    estado.textContent = "Guardando...";

    await conTiempoLimite(
      setDoc(
        doc(db, "perfiles", usuarioActual),
        { telefono, usuario: usuarioActual },
        { merge: true }
      ),
      30,
      "El guardado del número"
    );

    estado.textContent = "WhatsApp guardado.";
  } catch (error) {
    estado.textContent = "Error: " + error.message;
  }
}

/* GUARDAR FOTO DE PERFIL */
async function guardarFotoPerfil() {
  const archivo = $("fotoPerfil").files[0];
  const estado = $("estadoPerfil");
  const boton = $("btnGuardarPerfil");

  if (!archivo) {
    estado.textContent = "Selecciona una foto.";
    return;
  }

  boton.disabled = true;

  try {
    const foto = await subirFoto(archivo, "perfiles", (texto) => {
      estado.textContent = texto;
    });

    await conTiempoLimite(
      setDoc(
        doc(db, "perfiles", usuarioActual),
        { foto, usuario: usuarioActual },
        { merge: true }
      ),
      30,
      "El guardado del perfil en Firebase"
    );

    estado.textContent = "Foto de perfil guardada.";
  } catch (error) {
    estado.textContent = "Error: " + error.message;
  } finally {
    boton.disabled = false;
  }
}

/* CARGAR PERFILES */
onSnapshot(
  collection(db, "perfiles"),
  (snapshot) => {
    perfiles = {};

    snapshot.forEach((documento) => {
      perfiles[documento.id] = documento.data();
    });

    if (usuarioActual) mostrarPerfil();
    mostrarProductos();
  },
  (error) => {
    console.error("Error cargando perfiles:", error);
  }
);

/* PUBLICAR PRODUCTOS Y SERVICIOS */
$("formProducto").addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (!usuarioActual) {
    mostrarEstado("Inicia sesión primero.");
    return;
  }

  const nombre = $("nombre").value.trim();
  const precio = $("precio").value.trim();
  const descripcion = $("descripcion").value.trim();
  const categoria = $("categoria").value;
  const archivo = $("imagen").files[0];
  const boton = $("btnPublicar");

  if (!nombre || !precio || !descripcion || !archivo) {
    mostrarEstado("Completa todos los campos y selecciona una foto.");
    return;
  }

  if (!Number.isFinite(Number(precio)) || Number(precio) < 0) {
    mostrarEstado("Escribe un precio válido.");
    return;
  }

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
    mostrarEstado("¡Producto publicado correctamente!");
  } catch (error) {
    console.error("Error publicando:", error);
    mostrarEstado("No se pudo publicar: " + error.message);
  } finally {
    boton.disabled = false;
  }
});

/* CARGAR PUBLICACIONES */
onSnapshot(
  collection(db, "productos"),
  (snapshot) => {
    productos = [];

    snapshot.forEach((documento) => {
      productos.push({
        id: documento.id,
        ...documento.data()
      });
    });

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

/* FILTRAR */
if ($("filtro")) {
  $("filtro").addEventListener("change", (evento) => {
    filtroActual = evento.target.value;
    mostrarProductos();
  });
}

/* MOSTRAR PRODUCTOS */
function mostrarProductos() {
  const lista = $("lista");
  if (!lista) return;

  const filtrados = productos.filter((producto) => {
    return filtroActual === "Todos" ||
      producto.categoria === filtroActual;
  });

  lista.innerHTML = "";

  if (filtrados.length === 0) {
    lista.innerHTML = "<p>No hay publicaciones todavía.</p>";
    return;
  }

  filtrados.forEach((producto) => {
    const tarjeta = document.createElement("article");
    tarjeta.className = "tarjeta-producto";

    const perfil = perfiles[producto.vendedor] || {};

    const foto = document.createElement("img");
    foto.src = producto.imagen || "";
    foto.alt = producto.nombre || "Producto";
    foto.style.maxWidth = "100%";
    foto.style.maxHeight = "250px";
    foto.style.objectFit = "contain";

    foto.onerror = () => {
      foto.alt = "No se pudo cargar la imagen";
    };

    const titulo = document.createElement("h3");
    titulo.textContent = producto.nombre || "";

    const precio = document.createElement("p");
    precio.textContent = "$" + (producto.precio ?? "");

    const descripcion = document.createElement("p");
    descripcion.textContent = producto.descripcion || "";

    const categoria = document.createElement("p");
    categoria.textContent = "Categoría: " + (producto.categoria || "");

    const vendedor = document.createElement("p");
    vendedor.textContent = "Vendedor: " + (producto.vendedor || "");

    tarjeta.append(
      foto,
      titulo,
      precio,
      descripcion,
      categoria,
      vendedor
    );

    if (perfil.foto) {
      const fotoVendedor = document.createElement("img");
      fotoVendedor.src = perfil.foto;
      fotoVendedor.alt = "Foto del vendedor";
      fotoVendedor.style.width = "40px";
      fotoVendedor.style.height = "40px";
      fotoVendedor.style.objectFit = "cover";
      fotoVendedor.style.borderRadius = "50%";
      tarjeta.appendChild(fotoVendedor);
    }

    if (
      producto.vendedor !== usuarioActual &&
      perfil.telefono
    ) {
      const contacto = document.createElement("a");
      const numero = perfil.telefono.replace(/\D/g, "");
      contacto.href =
        "https://wa.me/" + numero;
      contacto.target = "_blank";
      contacto.rel = "noopener noreferrer";
      contacto.textContent = "Contactar por WhatsApp";
      tarjeta.appendChild(contacto);
    }

    if (producto.vendedor === usuarioActual) {
      const eliminar = document.createElement("button");
      eliminar.type = "button";
      eliminar.textContent = "Eliminar publicación";

      eliminar.onclick = async () => {
        if (!confirm("¿Seguro que quieres eliminar esta publicación?")) {
          return;
        }

        eliminar.disabled = true;

        try {
          await conTiempoLimite(
            deleteDoc(doc(db, "productos", producto.id)),
            30,
            "La eliminación del producto"
          );
        } catch (error) {
          alert("No se pudo eliminar: " + error.message);
          eliminar.disabled = false;
        }
      };

      tarjeta.appendChild(eliminar);
    }

    lista.appendChild(tarjeta);
  });
}

/* CHAT */
if ($("formChat")) {
  $("formChat").addEventListener("submit", (evento) => {
    evento.preventDefault();

    const entrada = $("mensaje");
    const mensajes = $("mensajes");

    const texto = entrada.value.trim();

    if (!texto || !usuarioActual) return;

    const mensaje = document.createElement("p");
    mensaje.textContent = usuarioActual + ": " + texto;

    mensajes.appendChild(mensaje);
    entrada.value = "";
  });
}

/* SEGURIDAD PARA TEXTO HTML */
function escaparHTML(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (caracter) => {
    const equivalencias = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return equivalencias[caracter];
  });
}

/* BOTONES DE ACCESO */
if ($("btnRegistrar")) {
  $("btnRegistrar").addEventListener("click", registrar);
}

if ($("btnIngresar")) {
  $("btnIngresar").addEventListener("click", iniciarSesion);
}

if ($("btnCerrarSesion")) {
  $("btnCerrarSesion").addEventListener("click", cerrarSesion);
}

/* INICIAR */
actualizarPantalla();
mostrarProductos();
