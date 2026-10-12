
import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let usuarioActual = localStorage.getItem("usuarioActual") || "";
let productos = [];
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

$("formProducto").addEventListener("submit", async (evento) => {
  evento.preventDefault();

  if (!usuarioActual) {
    mostrarEstado("Inicia sesión primero.");
    return;
  }

  const nombre = $("nombre").value.trim();
  const precio = Number($("precio").value);
  const descripcion = $("descripcion").value.trim();
  const imagen = $("imagen").value.trim();
  const categoria = $("categoria").value;

  if (!nombre || !descripcion || !Number.isFinite(precio) || precio < 0) {
    mostrarEstado("Revisa los datos del producto.");
    return;
  }

  const boton = $("btnPublicar");
  boton.disabled = true;
  mostrarEstado("Publicando producto...");

  try {
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
    mostrarEstado("No se pudo publicar. Revisa tu conexión y las reglas de Firebase.");
  } finally {
    boton.disabled = false;
  }
});

onSnapshot(
  collection(db, "productos"),
  (resultado) => {
    productos = resultado.docs.map((documento) => ({
      id: documento.id,
      ...documento.data()
    }));

    mostrarProductos();
    mostrarEstado("");
  },
  (error) => {
    console.error(error);
    mostrarEstado("No se pudieron cargar los productos. Revisa las reglas de Firebase.");
  }
);

function mostrarProductos() {
  const lista = $("lista");
  lista.replaceChildren();

  const encontrados = productos.filter((producto) => {
    return filtroActual === "Todos" || producto.categoria === filtroActual;
  });

  if (encontrados.length === 0) {
    const mensaje = document.createElement("p");
    mensaje.textContent = "Todavía no hay publicaciones en esta categoría.";
    lista.appendChild(mensaje);
    return;
  }

  encontrados.forEach((producto) => {
    const tarjeta = document.createElement("article");
    tarjeta.className = "producto";

    if (producto.imagen) {
      try {
        const direccion = new URL(producto.imagen);

        if (direccion.protocol === "https:" || direccion.protocol === "http:") {
          const foto = document.createElement("img");
          foto.src = direccion.href;
          foto.alt = producto.nombre || "Imagen del producto";
          foto.loading = "lazy";
          foto.onerror = () => foto.remove();
          tarjeta.appendChild(foto);
        }
      } catch (error) {
        // Si el enlace no es válido, se muestra el producto sin imagen.
      }
    }

    const nombre = document.createElement("h3");
    nombre.textContent = producto.nombre || "Producto";
    tarjeta.appendChild(nombre);

    const precio = document.createElement("p");
    precio.className = "precio";
    precio.textContent = `$${Number(producto.precio || 0).toFixed(2)}`;
    tarjeta.appendChild(precio);

    const descripcion = document.createElement("p");
    descripcion.textContent = producto.descripcion || "";
    tarjeta.appendChild(descripcion);

    const categoria = document.createElement("span");
    categoria.className = "categoria";
    categoria.textContent = producto.categoria || "Productos";
    tarjeta.appendChild(categoria);

    const vendedor = document.createElement("p");
    vendedor.textContent = `Vendedor: ${producto.vendedor || "Usuario"}`;
    tarjeta.appendChild(vendedor);

    lista.appendChild(tarjeta);
  });
}

$("filtro").addEventListener("change", (evento) => {
  filtroActual = evento.target.value;
  mostrarProductos();
});

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
