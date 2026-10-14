




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

// CONEXIÓN CON SUPABASE
const SUPABASE_URL = "https://pkbcoyelqegbxbrxefbk.supabase.co";
const SUPABASE_KEY = "sb_publishable_kk9cmEuMm3RdJ11P7stVlA_WYQytzeX";
const SUPABASE_BUCKET = "FOTOS MUEY";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

let usuarioActual = localStorage.getItem("usuarioActual") || "";
let productos = [];
let perfiles = {};
let filtroActual = "Todos";

const seccionLogin = $("seccionLogin");
const plataforma = $("plataforma");

function mostrarEstado(texto, elemento = "estado") {
  const destino = $(elemento);
  if (destino) destino.textContent = texto;
}

function actualizarPantalla() {
  seccionLogin.hidden = Boolean(usuarioActual);
  plataforma.hidden = !usuarioActual;
  mostrarPerfil();
}

function registrar() {
  const usuario = $("usuario").value.trim();
  const clave = $("clave").value;

  if (!usuario || !clave) {
    mostrarEstado("Escribe tu usuario y contraseña.", "mensajeLogin");
    return;
  }

  const cuentas = JSON.parse(
    localStorage.getItem("cuentasMuey") || "{}"
  );

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

  const cuentas = JSON.parse(
    localStorage.getItem("cuentasMuey") || "{}"
  );

  if (cuentas[usuario] && cuentas[usuario] === clave) {
    usuarioActual = usuario;
    localStorage.setItem("usuarioActual", usuario);
    actualizarPantalla();
    mostrarEstado("Sesión iniciada.", "mensajeLogin");
  } else {
    mostrarEstado(
      "Datos incorrectos o cuenta no registrada.",
      "mensajeLogin"
    );
  }
}

function cerrarSesion() {
  localStorage.removeItem("usuarioActual");
  usuarioActual = "";
  actualizarPantalla();
}

$("btnRegistrar").addEventListener("click", registrar);
$("btnIngresar").addEventListener("click", iniciarSesion);
$("btnCerrarSesion").addEventListener("click", cerrarSesion);

// COMPRIMIR FOTOS
function comprimirFoto(archivo) {
  return new Promise((resolve, reject) => {
    if (!archivo || !archivo.type.startsWith("image/")) {
      reject(new Error("Selecciona una imagen válida."));
      return;
    }

    const lector = new FileReader();

    lector.onerror = () =>
      reject(new Error("No se pudo leer la foto."));

    lector.onload = () => {
      const imagen = new Image();

      imagen.onerror = () =>
        reject(new Error("La imagen no es válida."));

      imagen.onload = () => {
        const maximo = 1000;
        const escala = Math.min(
          1,
          maximo / Math.max(imagen.width, imagen.height)
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(
          1,
          Math.round(imagen.width * escala)
        );
        canvas.height = Math.max(
          1,
          Math.round(imagen.height * escala)
        );

        const contexto = canvas.getContext("2d");

        contexto.drawImage(
          imagen,
          0,
          0,
          canvas.width,
          canvas.height
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("No se pudo comprimir la foto."));
            }
          },
          "image/jpeg",
          0.75
        );
      };

      imagen.src = lector.result;
    };

    lector.readAsDataURL(archivo);
  });
}

// SUBIR FOTO A SUPABASE
async function subirFoto(archivo, carpeta) {
  const imagen = await comprimirFoto(archivo);

  const ruta =
    `${carpeta}/${Date.now()}-` +
    `${Math.random().toString(36).slice(2)}.jpg`;

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(ruta, imagen, {
      contentType: "image/jpeg",
      upsert: false
    });

  if (error) throw error;

  const { data } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(ruta);

  return data.publicUrl;
}

// PANEL DEL PERFIL
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

plataforma.prepend(panelPerfil);

function mostrarPerfil() {
  $("nombrePerfilActual").textContent = usuarioActual
    ? `Usuario: ${usuarioActual}`
    : "";

  const foto = $("fotoPerfilActual");
  const url = perfiles[usuarioActual]?.foto;

  if (url) {
    foto.src = url;
    foto.style.display = "block";
  } else {
    foto.removeAttribute("src");
    foto.style.display = "none";
  }
}

// GUARDAR FOTO DEL PERFIL
$("btnGuardarPerfil").addEventListener("click", async () => {
  if (!usuarioActual) return;

  const archivo = $("fotoPerfil").files[0];

  if (!archivo) {
    mostrarEstado("Selecciona una foto primero.", "estadoPerfil");
    return;
  }

  const boton = $("btnGuardarPerfil");
  boton.disabled = true;

  mostrarEstado("Subiendo foto...", "estadoPerfil");

  try {
    const foto = await subirFoto(archivo, "perfiles");

    await setDoc(
      doc(db, "perfiles", usuarioActual),
      {
        usuario: usuarioActual,
        foto,
        actualizado: serverTimestamp()
      },
      { merge: true }
    );

    $("fotoPerfil").value = "";
    mostrarEstado("Foto de perfil guardada.", "estadoPerfil");
  } catch (error) {
    console.error("Error al guardar perfil:", error);
    mostrarEstado(
      "No se pudo guardar la foto: " + error.message,
      "estadoPerfil"
    );
  } finally {
    boton.disabled = false;
  }
});

// CARGAR PERFILES
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
    console.error("Error al cargar perfiles:", error);
    mostrarEstado("No se pudieron cargar los perfiles.");
  }
);

// PUBLICAR PRODUCTOS Y SERVICIOS
$("formProducto").addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (!usuarioActual) {
    mostrarEstado("Inicia sesión primero.");
    return;
  }

  const nombre = $("nombre").value.trim();
  const precio = Number($("precio").value);
  const descripcion = $("descripcion").value.trim();
  const archivo = $("imagen").files[0];
  const categoria = $("categoria").value;

  if (
    !nombre ||
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

  mostrarEstado("Subiendo foto y publicando...");

  try {
    const imagen = await subirFoto(archivo, "productos");

    await addDoc(collection(db, "productos"), {
      nombre,
      precio,
      descripcion,
      imagen,
      categoria,
      vendedor: usuarioActual,
      creado: serverTimestamp()
    });

    $("formProducto").reset();
    mostrarEstado("¡Publicación guardada correctamente!");
  } catch (error) {
    console.error("Error al publicar:", error);
    mostrarEstado(
      "No se pudo publicar: " + error.message
    );
  } finally {
    boton.disabled = false;
  }
});

// CARGAR PUBLICACIONES
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
    mostrarEstado("");
  },
  (error) => {
    console.error("Error al cargar productos:", error);
    mostrarEstado(
      "No se pudieron cargar los productos. Revisa Firestore."
    );
  }
);

// MOSTRAR PUBLICACIONES Y BOTÓN PARA ELIMINAR
function mostrarProductos() {
  const lista = $("lista");
  if (!lista) return;

  lista.replaceChildren();

  const encontrados = productos.filter(
    (producto) =>
      filtroActual === "Todos" ||
      producto.categoria === filtroActual
  );

  if (encontrados.length === 0) {
    const mensaje = document.createElement("p");
    mensaje.textContent =
      "Todavía no hay publicaciones en esta categoría.";
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
    precio.className = "precio";
    precio.textContent =
      `$${Number(producto.precio || 0).toFixed(2)}`;
    contenido.appendChild(precio);

    const nombre = document.createElement("strong");
    nombre.textContent = producto.nombre || "Producto";
    contenido.appendChild(nombre);

    const descripcion = document.createElement("p");
    descripcion.textContent = producto.descripcion || "";
    contenido.appendChild(descripcion);

    const categoria = document.createElement("span");
    categoria.className = "categoria";
    categoria.textContent = producto.categoria || "Productos";
    contenido.appendChild(categoria);

    tarjeta.appendChild(contenido);

    // BOTÓN PARA ELIMINAR LAS PROPIAS PUBLICACIONES
    if (
      usuarioActual &&
      producto.vendedor === usuarioActual
    ) {
      const botonEliminar = document.createElement("button");
      botonEliminar.type = "button";
      botonEliminar.textContent = "🗑️ Eliminar publicación";
      botonEliminar.style.cssText =
        "display:block;margin:0 14px 14px;padding:10px 14px;background:#dc2626;color:white;border:0;border-radius:6px;cursor:pointer;";

      botonEliminar.addEventListener("click", async () => {
        const confirmar = confirm(
          `¿Seguro que quieres eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`
        );

        if (!confirmar) return;

        botonEliminar.disabled = true;
        botonEliminar.textContent = "Eliminando...";

        try {
          await deleteDoc(doc(db, "productos", producto.id));

          mostrarEstado("Publicación eliminada correctamente.");
        } catch (error) {
          console.error("Error al eliminar:", error);

          mostrarEstado(
            "No se pudo eliminar. Revisa los permisos de Firebase."
          );

          botonEliminar.disabled = false;
          botonEliminar.textContent = "🗑️ Eliminar publicación";
        }
      });

      tarjeta.appendChild(botonEliminar);
    }

    lista.appendChild(tarjeta);
  });
}

// FILTRAR CATEGORÍAS
$("filtro").addEventListener("change", (evento) => {
  filtroActual = evento.target.value;
  mostrarProductos();
});

// CHAT: SOLO FUNCIONA EN ESTE NAVEGADOR
$("formChat").addEventListener("submit", (evento) => {
  evento.preventDefault();

  const campo = $("mensaje");
  const texto = campo.value.trim();

  if (!texto || !usuarioActual) return;

  const mensaje = document.createElement("p");
  mensaje.textContent = `${usuarioActual}: ${texto}`;
  $("mensajes").appendChild(mensaje);

  campo.value = "";
});

actualizarPantalla();
mostrarProductos();
