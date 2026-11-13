# Entre Cerros y Balas: página web inmersiva 3D

Versión web, pensada primero para celular, de la presentación *Entre Cerros y Balas* (Ochoa Cesar). Respeta el formato de las láminas: barra negra con el nombre, títulos rojos tipo slab, tarjetas amarillas, fotos con borde de papel rasgado y la paleta de la ilustración (cielo celeste con nubes crema, cordones azul-violeta, cerros naranja, rojo y ocre).

## Qué tiene

- **Escena 3D de la Quebrada** de fondo (WebGL2, sin librerías). La cámara recorre el camino a medida que se hace scroll y cada lámina tiene su propio encuadre:
  - **Portada:** los dos gauchos cabalgan hacia los cerros, como en la ilustración.
  - **Jugabilidad:** plano lateral de los jinetes.
  - **Enemigos:** la cámara mira a las tropas realistas en lo alto de un cerro.
  - **Entorno:** plano aéreo panorámico.
  - **¡Muchas Gracias!:** cierra con el mismo cuadro de la portada.
- Los caballos caminan y la escena reacciona levemente al dedo, al mouse o a la inclinación del celular.
- Las 8 secciones tienen el mismo texto que el PDF. Las imágenes de cada lámina se recortaron del PDF y se pueden ampliar tocándolas.
- **Jugar la demo:** enlaza a la versión web del juego, incluida en `juego/`.
- Si el navegador no tiene WebGL2, se muestra la ilustración original de fondo.

## Estructura

```
index.html      secciones y textos
estilos.css     formato de las láminas (mobile primero, se adapta a escritorio)
escena.js       escena 3D y cámara por sección
pagina.js       navegación, aparición al hacer scroll, bordes rasgados y visor de fotos
assets/         ilustración de portada e imágenes recortadas del PDF
juego/          demo jugable "Entre cerros y balas"
```

## Publicar

Es un sitio estático: se sube la carpeta tal cual a Vercel, Netlify o GitHub Pages. No hace falta compilar nada.
Para probarlo en la computadora, abrilo con un servidor local (por ejemplo `npx serve .`), no con doble clic, porque los módulos JS no cargan desde `file://`.

## Tipografías

Los títulos usan **Alfa Slab One** y los textos **Montserrat**, las dos de Google Fonts, que se cargan solas al estar online. Sin conexión se usan tipografías similares del sistema.

## Editar

- **Textos:** directamente en `index.html`.
- **Encuadre 3D de cada sección:** en el objeto `K` de `escena.js`.
  - `s`: punto del camino
  - `h`: altura
  - `yaw` y `pitch`: dirección de la mirada
  - `lead`: distancia a los jinetes
- **Colores:** en el objeto `C` de `escena.js` y en las variables del inicio de `estilos.css`.
