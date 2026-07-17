// Generadores de lienzos reutilizados como texturas de objetos 3D.
(function () {
  function crear(Tiles) {
    // ---------- pintores frontales a medida (llenan TODO el lienzo: sin márgenes) ----------
    const SH = (c, f) => Tiles.shade(c, f);
    function lienzo(w, h, fn) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      fn(c.getContext('2d'), w, h);
      return c;
    }
    const PINTORES = {
      puerta: (col) => lienzo(44, 64, (x, w, h) => {
        x.fillStyle = '#241c12'; x.fillRect(0, 0, w, h);                 // marco
        x.fillStyle = SH(col, 0.42); x.fillRect(3, 3, w - 6, h - 3);     // hoja
        x.strokeStyle = SH(col, 0.7); x.lineWidth = 2;
        x.strokeRect(8, 8, w - 16, 20);                                  // cuarterón sup
        x.strokeRect(8, 34, w - 16, 20);                                 // cuarterón inf
        x.fillStyle = '#e8d890';                                          // pomo
        x.beginPath(); x.arc(w - 9, h / 2 + 2, 2.6, 0, 7); x.fill();
        x.fillStyle = col; x.globalAlpha = 0.5;                           // luz bajo la puerta
        x.fillRect(4, h - 3, w - 8, 3);
      }),
      // puerta de emergencia (L0 → L14): metal oscuro + barra antipánico + rótulo
      // EXIT sobre baliza roja — se distingue de cualquier otra puerta del juego
      emergencia: () => lienzo(44, 64, (x, w, h) => {
        x.fillStyle = '#181210'; x.fillRect(0, 0, w, h);                   // marco oscuro
        x.fillStyle = '#3a2c28'; x.fillRect(3, 12, w - 6, h - 15);         // hoja
        x.strokeStyle = '#5a4038'; x.lineWidth = 2;
        x.strokeRect(7, 18, w - 14, h - 32);                                // panel
        x.fillStyle = '#c81818';                                            // barra antipánico
        x.fillRect(6, h - 22, w - 12, 5);
        x.fillStyle = '#2a0808'; x.fillRect(2, 0, w - 4, 11);               // caja del rótulo
        x.fillStyle = '#ff2020'; x.font = 'bold 8px monospace'; x.textAlign = 'center';
        x.fillText('EXIT', w / 2, 8);
      }),
      ventana: (col) => lienzo(44, 64, (x, w, h) => {
        x.fillStyle = '#2a2a2e'; x.fillRect(0, 0, w, h);
        x.fillStyle = SH(col, 0.9); x.globalAlpha = 0.85;
        const pw = (w - 12) / 2, ph = (h - 12) / 2;
        for (const [px2, py2] of [[4, 4], [8 + pw, 4], [4, 8 + ph], [8 + pw, 8 + ph]])
          x.fillRect(px2, py2, pw, ph);
      }),
      vending: () => lienzo(40, 64, (x, w, h) => {
        x.fillStyle = '#a83848'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#701828'; x.fillRect(0, 0, w, 4);
        x.fillStyle = '#d8e8f0'; x.globalAlpha = 0.85;                    // escaparate
        x.fillRect(4, 7, w - 16, h - 22);
        x.globalAlpha = 1;
        x.fillStyle = '#701828'; x.fillRect(w - 10, 7, 7, h - 22);        // panel
        x.fillStyle = '#ffe060'; x.fillRect(w - 9, 12, 5, 5);             // botón 9
        x.fillStyle = '#c8a830'; x.fillRect(w - 9, 20, 5, 5);             // botón 8
        x.fillStyle = '#1a0c10'; x.fillRect(4, h - 11, w - 8, 7);         // bandeja
      }),
      reloj: () => lienzo(48, 28, (x, w, h) => {
        x.fillStyle = '#20242a'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#4a5058'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2);
        x.fillStyle = '#40ff80';
        x.font = 'bold 13px monospace'; x.textAlign = 'center';
        x.fillText('88:88', w / 2, h / 2 + 5);
      }),
      boton: () => lienzo(40, 40, (x, w, h) => {
        x.fillStyle = '#c8ccd4'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#8a92a0'; x.strokeRect(1.5, 1.5, w - 3, h - 3);
        x.fillStyle = '#d83030';
        x.beginPath(); x.arc(w / 2, h / 2 - 4, 9, 0, 7); x.fill();
        x.fillStyle = '#2a2e34'; x.font = 'bold 7px monospace'; x.textAlign = 'center';
        x.fillText('ESCAPE', w / 2, h - 6);
      }),
      enchufe: () => lienzo(16, 20, (x, w, h) => {
        x.fillStyle = '#b9ae78'; x.fillRect(1, 1, w - 2, h - 2);
        x.strokeStyle = '#756b45'; x.lineWidth = 1; x.strokeRect(1.5, 1.5, w - 3, h - 3);
        x.fillStyle = '#393522';
        x.fillRect(5, 6, 2, 5); x.fillRect(9, 6, 2, 5);
        x.fillStyle = '#6e6542'; x.fillRect(7, 14, 2, 2);
        x.fillStyle = '#d7cc92'; x.fillRect(3, 3, w - 6, 1);
      }),
      edificio: () => lienzo(44, 64, (x, w, h) => {
        x.fillStyle = '#38404c'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#6ae86a'; x.globalAlpha = 0.8;
        for (let fy = 0; fy < 7; fy++)
          for (let fx = 0; fx < 4; fx++)
            if ((fx + fy) % 2 === 0) x.fillRect(4 + fx * 10, 4 + fy * 8.5, 6, 5);
      }),
      trampilla: (col) => lienzo(48, 48, (x, w, h) => {
        x.fillStyle = '#3a332a'; x.fillRect(0, 0, w, h);                 // marco
        x.fillStyle = '#060402'; x.fillRect(5, 5, w - 10, h - 10);        // hueco
        const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, 18);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.globalAlpha = 0.55; x.fillStyle = g; x.fillRect(5, 5, w - 10, h - 10);
        x.globalAlpha = 1;
        x.fillStyle = '#5a5044';                                          // bisagras
        x.fillRect(8, 2, 8, 4); x.fillRect(w - 16, 2, 8, 4);
      }),
      sueloGrieta: () => lienzo(48, 48, (x, w, h) => {
        x.clearRect(0, 0, w, h);
        x.strokeStyle = 'rgba(24,17,8,0.95)'; x.lineWidth = 3;
        x.beginPath();
        x.moveTo(3, 26); x.lineTo(16, 20); x.lineTo(24, 28);
        x.lineTo(34, 13); x.lineTo(45, 20);
        x.moveTo(24, 28); x.lineTo(30, 44);
        x.moveTo(16, 20); x.lineTo(12, 6);
        x.stroke();
      }),
      // cerco de humedad suelto: un único decal circular con caída de alpha,
      // reutilizado por TODAS las manchas del suelo (una textura, un material).
      mancha: () => lienzo(64, 64, (x, w, h) => {
        const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2 - 3);
        g.addColorStop(0, 'rgba(18,14,7,0.5)');
        g.addColorStop(0.65, 'rgba(18,14,7,0.25)');
        g.addColorStop(1, 'rgba(18,14,7,0)');
        x.fillStyle = g;
        x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 3, 0, 7); x.fill();
      }),
      escalera: (col) => lienzo(48, 48, (x, w, h) => {
        x.fillStyle = '#0a0806'; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) {
          x.fillStyle = SH(col, 0.95 - i * 0.14);
          x.fillRect(4, 4 + i * 7, w - 8, 6);
        }
      }),
      taquilla: () => lienzo(48, 84, (x, w, h) => {
        x.fillStyle = '#5a6a74'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#39434b'; x.lineWidth = 2;
        x.strokeRect(1, 1, w - 2, h - 2);
        x.beginPath(); x.moveTo(w / 2, 2); x.lineTo(w / 2, h - 2); x.stroke();  // dos puertas
        x.fillStyle = '#414c54';
        for (const px2 of [6, w / 2 + 4])                                       // rejillas
          for (let ry = 8; ry <= 22; ry += 7) x.fillRect(px2, ry, w / 2 - 10, 3);
        x.fillStyle = '#2c343a';                                                // tiradores
        x.fillRect(w / 2 - 7, h / 2 + 4, 3, 12); x.fillRect(w / 2 + 4, h / 2 + 4, 3, 12);
        x.fillStyle = '#39434b'; x.fillRect(0, h - 6, w, 6);                    // zócalo
      }),
      archivador: () => lienzo(48, 84, (x, w, h) => {
        x.fillStyle = '#7a7264'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#544e42'; x.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          x.strokeRect(4, 4 + i * 20, w - 8, 17);
          x.fillStyle = '#4a463c'; x.fillRect(w / 2 - 7, 11 + i * 20, 14, 4);
        }
      }),
      nevera: () => lienzo(48, 84, (x, w, h) => {
        x.fillStyle = '#c8d0cc'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#8e9a94'; x.lineWidth = 2;
        x.strokeRect(1, 1, w - 2, h - 2);
        x.beginPath(); x.moveTo(2, 28); x.lineTo(w - 2, 28); x.stroke();
        x.fillStyle = '#6e7a74';
        x.fillRect(w - 10, 8, 4, 14); x.fillRect(w - 10, 34, 4, 26);
      }),
      camilla: () => lienzo(48, 32, (x, w, h) => {
        x.fillStyle = '#c8d4cc'; x.fillRect(0, 0, w, 12);                 // colchoneta
        x.fillStyle = '#e0e8e2'; x.fillRect(0, 0, w, 4);
        x.fillStyle = '#6a746e'; x.fillRect(0, 12, w, h - 12);            // faldón
        x.fillStyle = '#3a403c';
        x.beginPath(); x.arc(9, h - 4, 4, 0, 7); x.fill();
        x.beginPath(); x.arc(w - 9, h - 4, 4, 0, 7); x.fill();
      }),
      cofre: () => lienzo(44, 48, (x, w, h) => {
        x.fillStyle = '#8a6a42'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#6e5434'; x.fillRect(0, 0, w, 12);
        x.fillRect(w / 2 - 3, 0, 6, h);
        x.fillStyle = '#e0b040'; x.fillRect(w / 2 - 5, 16, 10, 12);
      }),
      caja: () => lienzo(44, 48, (x, w, h) => {
        x.fillStyle = '#8a6a42'; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#5e4830'; x.lineWidth = 3;
        x.strokeRect(2, 2, w - 4, h - 4);
        x.beginPath(); x.moveTo(2, 2); x.lineTo(w - 2, h - 2);
        x.moveTo(w - 2, 2); x.lineTo(2, h - 2); x.stroke();
      }),
      bidon: () => lienzo(44, 48, (x, w, h) => {
        x.fillStyle = '#4a6858'; x.fillRect(0, 0, w, h);
        x.fillStyle = '#5e7c6c'; x.fillRect(6, 0, 10, h);
        x.fillStyle = '#324a3e';
        x.fillRect(0, 10, w, 5); x.fillRect(0, 30, w, 5);
      }),
      grieta: () => lienzo(44, 64, (x, w, h) => {
        // muro agrietado (fondo transparente: se pega sobre la pared real)
        x.strokeStyle = 'rgba(16,12,8,0.9)';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(w / 2, 2);
        x.lineTo(w / 2 - 6, 16); x.lineTo(w / 2 + 4, 28);
        x.lineTo(w / 2 - 4, 42); x.lineTo(w / 2 + 6, 54); x.lineTo(w / 2 + 2, h - 2);
        x.stroke();
        x.lineWidth = 1.5;
        x.beginPath();
        x.moveTo(w / 2 - 6, 16); x.lineTo(w / 2 - 15, 22);
        x.moveTo(w / 2 + 4, 28); x.lineTo(w / 2 + 14, 31);
        x.moveTo(w / 2 - 4, 42); x.lineTo(w / 2 - 13, 48);
        x.moveTo(w / 2 + 6, 54); x.lineTo(w / 2 + 13, 58);
        x.stroke();
        x.globalAlpha = 0.35;                          // un hilo de luz se cuela
        x.strokeStyle = '#fff8e0';
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(w / 2 - 1, 4); x.lineTo(w / 2 - 5, 16); x.lineTo(w / 2 + 3, 28);
        x.stroke();
      }),
      boquete: () => lienzo(44, 64, (x, w, h) => {
        // pared ROTA: boquete negro con luz blanca dentro (florece con el bloom)
        x.fillStyle = '#0a0806';
        x.beginPath();
        x.moveTo(6, 8); x.lineTo(16, 3); x.lineTo(30, 6); x.lineTo(w - 5, 14);
        x.lineTo(w - 8, 40); x.lineTo(w - 4, h - 8); x.lineTo(20, h - 3);
        x.lineTo(5, h - 12); x.lineTo(8, 30);
        x.closePath(); x.fill();
        x.fillStyle = '#ffffff';                       // la luz del otro lado
        x.beginPath();
        x.moveTo(12, 14); x.lineTo(26, 9); x.lineTo(w - 10, 18);
        x.lineTo(w - 12, 42); x.lineTo(w - 9, h - 13); x.lineTo(20, h - 9);
        x.lineTo(10, h - 17); x.lineTo(12, 32);
        x.closePath(); x.fill();
      }),
      planta: () => lienzo(40, 44, (x, w, h) => {
        // helecho: tallos con hojas (fondo transparente)
        for (let i = 0; i < 6; i++) {
          const bx = 6 + i * 5.5, alto = 16 + (i * 13) % 20;
          x.strokeStyle = i % 2 ? '#3f7a48' : '#59985e';
          x.lineWidth = 2;
          x.beginPath();
          x.moveTo(w / 2, h);
          x.quadraticCurveTo(bx, h - alto / 2, bx + (i % 2 ? 3 : -3), h - alto);
          x.stroke();
          x.fillStyle = i % 2 ? '#4e8c55' : '#6aad70';
          x.beginPath();
          x.ellipse(bx + (i % 2 ? 3 : -3), h - alto, 3.5, 6, 0.4, 0, 7);
          x.fill();
        }
      }),
    };

    return { pintores: PINTORES, lienzo, sombrear: SH };
  }

  window.Render3DPainters = { crear };
})();
