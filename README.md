# HTML APLICACION

Aplicacion web local para crear y editar emails HTML con un chat IA en lenguaje natural.

Proyecto corporativo para **ARTES BUHO**.
Desarrollador: **RUBEN COTON**.
Paleta corporativa aplicada: **rojo, amarillo y blanco**.

Incluye:

- Chat IA para pedir cambios directos sobre el email.
- Editor HTML en vivo.
- Vista previa inmediata.
- Vista en texto plano.
- Exportacion en `.html` y `.txt`.

## Requisitos

- Node.js 20 o superior.
- API key de OpenAI.

## Arranque local

1. Crea `C:\Users\elrub\Desktop\CAPETA CODEX\HTML-APLICACION\.env` con:

   ```env
   OPENAI_API_KEY=tu_api_key
   OPENAI_MODEL=gpt-4.1-mini
   PORT=8787
   ```

2. Inicia el servidor:

   ```powershell
   node server.js
   ```

3. Abre:

   [http://localhost:8787](http://localhost:8787)

## Flujo de publicacion (ya preparado)

- Repositorio Git inicializado.
- Estructura limpia para escalar.
- Scripts de comprobacion:

  ```powershell
  node --check server.js
  node --check public/app.js
  ```

## Estructura

```txt
HTML-APLICACION/
  public/
    index.html
    styles.css
    app.js
  .env.example
  .gitignore
  package.json
  server.js
  README.md
```
