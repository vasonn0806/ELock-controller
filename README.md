# E-Paper Tag Controller

Independent rebuild of a browser-based e-paper Bluetooth controller.

## Features
- Web Bluetooth scan/reconnect/send command layer
- Clock/calendar/image/sleep/refresh command buttons
- Countdown canvas generator
- Image upload, resize, rotate, brightness/contrast/saturation, B&W dithering
- Template designer with text/shapes/layer order/move/copy/delete/export
- PNG export and canvas upload packet sender

## Deploy to a new domain
1. Upload `index.html`, `styles.css`, and `app.js` to hosting such as GitHub Pages, Netlify, Vercel, or your own HTTPS domain.
2. Web Bluetooth works only on HTTPS or localhost.
3. Open `app.js` and update `DEVICE_PROFILE` UUIDs if your e-paper module does not use FFE0/FFE1 or Nordic UART.
4. If the device expects a proprietary binary protocol, replace `cmdPacket()` and `sendCanvas()` with the vendor packet format.

## Local test
Open a terminal in this folder:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080` in Chrome/Edge.
