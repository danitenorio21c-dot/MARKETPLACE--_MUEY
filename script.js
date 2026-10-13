


import { db } from "./firebase.js";

import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

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
  localStorage.removeItem("usuarioActual");
  usuarioActual = "";
  actualizarPantalla();
}

$("btnRegistrar").addEventListener("click", registrar);
$("btnIngresar").addEventListener("click", iniciarSesion);
$("btnCerrarSesion").addEventListener("click", cerrarSesion);

// Comprimir las fotos para intentar guardarlas en Firestore
function comprimirFoto(archivo) {
  return new Promise((resolve, reject) => {
    if (!archivo || !archivo.type.startsWith("image/")) {
      reject(new Error("Selecciona un archivo de imagen válido."));
      return;
    }

    const lector = new FileReader();

    lector.onerror = () => reject(new Error("No se pudo leer la foto."));

    lector.onload = () => {
      const imagen = new Image();

      imagen.onerror = () => reject(new Error("La imagen no es válida."));

      imagen.onload = () => {
        const maximo = 400;
        const escala = Math.min(
          1,
          maximo / Math.max(imagen.width, imagen.height)
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(imagen.width * escala));
        canvas.height = Math.max(1, Math.round(imagen.height * escala));

        const contexto = canvas.getContext("2d");
        contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);

        // JPEG reduce el tamaño; calidad baja para respetar límites.
        resolve(canvas.toDataURL("image/jpeg", 0.45));
      };

      imagen.src = lector.result;
    };

    lector.readAsDataURL(archivo);
  });
}

// Panel del perfil
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

$("btnGuardarPerfil").addEventListener("click", async () => {
  if (!usuarioActual) return;

  const archivo = $("fotoPerfil").files[0];

  if (!archivo) {
    mostrarEstado("Selecciona una foto primero.", "estadoPerfil");
    return;
  }

  const boton = $("btnGuardarPerfil");
  boton.disabled = true;
  mostrarEstado("Comprimiendo y guardando foto...", "estadoPerfil");

  try {
    const foto = await comprimirFoto(archivo);

    await setDoc(doc(db, "perfiles", usuarioActual), {
      usuario: usuarioActual,
      foto,
      actualizado: serverTimestamp()
    }, { merge: true });

    $("fotoPerfil").value = "";
    mostrarEstado("Foto de perfil guardada.", "estadoPerfil");
  } catch (error) {
    console.error(error);
    mostrarEstado(
      "No se pudo guardar. La foto puede superar el límite de Firestore.",
      "estadoPerfil"
    );
  } finally {
    boton.disabled = false;
  }
});

// Cargar perfiles de los vendedores
onSnapshot(collection(db, "perfiles"), (resultado) => {
  perfiles = {};

  resultado.docs.forEach((documento) => {
    perfiles[documento.id] = documento.data();
  });

  mostrarPerfil();
  mostrarProductos();
}, (error) => {
  console.error(error);
  mostrarEstado("No se pudieron cargar los perfiles.");
});

// Publicar productos
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

  if (!nombre || !descripcion || !Number.isFinite(precio) || precio < 0) {
    mostrarEstado("Revisa los datos del producto.");
    return;
  }

  if (!archivo) {
    mostrarEstado("Selecciona una foto del producto.");
    return;
  }

  const boton = $("btnPublicar");
  boton.disabled = true;
  mostrarEstado("Comprimiendo foto y publicando producto...");

  try {
    const imagen = await comprimirFoto(archivo);

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
    mostrarEstado("¡Producto publicado correctamente!");
  } catch (error) {
    console.error(error);
    mostrarEstado(
      "No se pudo publicar. Revisa las reglas y el límite de Firestore."
    );
  } finally {
    boton.disabled = false;
  }
});

// Mostrar publicaciones nuevas primero
onSnapshot(collection(db, "productos"), (resultado) => {
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
}, (error) => {
  console.error(error);
  mostrarEstado("No se pudieron cargar los productos. Revisa Firestore.");
});

function mostrarProductos() {
  const lista = $("lista");
  if (!lista) return;

  lista.replaceChildren();

  const encontrados = productos.filter((producto) =>
    filtroActual === "Todos" || producto.categoria === filtroActual
  );

  if (encontrados.length === 0) {
    const mensaje = document.createElement("p");
    mensaje.textContent = "Todavía no hay publicaciones en esta categoría.";
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
    precio.textContent = `$${Number(producto.precio || 0).toFixed(2)}`;
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
    lista.appendChild(tarjeta);
  });
}

$("filtro").addEventListener("change", (evento) => {
  filtroActual = evento.target.value;
  mostrarProductos();
});

// Chat: por ahora solo aparece en este navegador.
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
