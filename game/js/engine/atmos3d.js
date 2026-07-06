// Atmósfera 3D: polvo en suspensión alrededor del jugador. (v15: las luminarias
// procedurales se eliminaron a petición del usuario — la sensación de luz de techo
// la dan los paneles fluorescentes ESTÁTICOS del techo en render3d + la luz
// direccional cenital del motor.) Con NOFX es no-op total.
(function () {
  if (!window.THREE) { window.Atmos3D = null; return; }

  const DUST_N = 160;

  let dust = null, dustPos = null, dustSeed = null;
  let listo = false;

  function puntito() {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,250,235,1)');
    g.addColorStop(0.5, 'rgba(255,250,235,0.35)');
    g.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
    return c;
  }

  function init(scene) {
    if (window.NOFX || listo) return;
    listo = true;
    // polvo en suspensión alrededor del jugador (vive en scene: sobrevive rebuilds)
    dustPos = new Float32Array(DUST_N * 3);
    dustSeed = new Float32Array(DUST_N * 2);
    for (let i = 0; i < DUST_N; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 12;
      dustPos[i * 3 + 1] = Math.random() * 2.2;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 9;
      dustSeed[i * 2] = Math.random() * 7;
      dustSeed[i * 2 + 1] = 0.4 + Math.random() * 0.8; // velocidad de caída propia
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const mapTex = new THREE.CanvasTexture(puntito());
    const mat = new THREE.PointsMaterial({
      size: 0.035, sizeAttenuation: true, map: mapTex, transparent: true,
      opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    dust = new THREE.Points(geo, mat);
    dust.frustumCulled = false;
    scene.add(dust);
  }

  function buildLevel() { /* las luminarias pertenecen al techo; aquí solo vive el polvo */ }

  function frame(world, t, px, pz, luzOn) {
    if (window.NOFX || !listo || !dust) return;
    // polvo: deriva senoidal + caída lenta, envuelto en una caja alrededor del jugador
    const dt = Math.min(50, t - (frame._t || t));
    frame._t = t;
    const BX = 12, BY = 2.2, BZ = 9;
    for (let i = 0; i < DUST_N; i++) {
      let x = dustPos[i * 3], y = dustPos[i * 3 + 1], z = dustPos[i * 3 + 2];
      x += Math.sin(t * 0.0003 + dustSeed[i * 2]) * 0.0006 * dt;
      y -= dustSeed[i * 2 + 1] * 0.00012 * dt;
      z += Math.cos(t * 0.00022 + dustSeed[i * 2] * 2) * 0.0004 * dt;
      // wrap relativo al jugador (el enjambre le sigue sin teletransportes visibles)
      const rx = x - px, rz = z - pz;
      if (rx > BX / 2) x -= BX; else if (rx < -BX / 2) x += BX;
      if (rz > BZ / 2) z -= BZ; else if (rz < -BZ / 2) z += BZ;
      if (y < 0.05) y += BY;
      dustPos[i * 3] = x; dustPos[i * 3 + 1] = y; dustPos[i * 3 + 2] = z;
    }
    dust.geometry.attributes.position.needsUpdate = true;
    // con la linterna, las motas destacan en el haz
    const mat = dust.material;
    mat.opacity += ((luzOn ? 0.5 : 0.32) - mat.opacity) * 0.05;
    mat.size += ((luzOn ? 0.045 : 0.035) - mat.size) * 0.05;
  }

  window.Atmos3D = { init, buildLevel, frame };
})();
