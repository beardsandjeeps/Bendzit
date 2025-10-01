(() => {
  // === helpers ===
  const $ = (id) => document.getElementById(id);
  const tubesDiv = $('tubes');
  const toNum = (v) => { v = parseFloat(v); return isNaN(v) ? 0 : v; };
  const unitFactor = () => $('units').value === 'mm' ? 25.4 : 1; // UI -> inches
  const fmtLen = (inches) => {
    const u = $('units').value;
    const val = u === 'mm' ? inches*25.4 : inches;
    return val.toFixed(2) + ' ' + u;
  };
  const densityLbin3 = () => $('material').value === 'aluminum' ? 0.0975 : 0.283;

  // === state ===
  let tubes = []; // each tube: {name, startTail, endTail, bends:[{angle, clr, straight}], color, pos:[x,y,z], rot:[rx,ry,rz]}
  let currentTubeIdx = 0;

  // === UI builders ===
  function tubeCard(t, idx){
    const wrap = document.createElement('div');
    wrap.className = 'tube';
    wrap.dataset.idx = idx;
    wrap.innerHTML = `
      <div class="row">
        <div style="flex:1"><label>Tube Name</label><input class="tName" value="${t.name}"></div>
        <div style="width:110px"><label>Color</label><input class="tColor" type="color" value="${t.color}"></div>
        <div style="width:110px"><label>&nbsp;</label><button class="sel ${idx===currentTubeIdx?'':'secondary'}">Select</button></div>
      </div>
      <div class="row" style="margin-top:6px">
        <div style="flex:1"><label>Start Tail</label><input class="startTail" type="number" step="any" value="${t.startTail}"></div>
        <div style="flex:1"><label>End Tail</label><input class="endTail" type="number" step="any" value="${t.endTail}"></div>
        <div style="flex:1"><label>OD Override (optional)</label><input class="odOverride" type="number" step="any" value="${t.odOverride??''}" placeholder=""></div>
      </div>
      <div class="row" style="margin-top:6px">
        <div style="flex:1"><label>Position X</label><input class="posX" type="number" step="any" value="${t.pos[0]}"></div>
        <div style="flex:1"><label>Y</label><input class="posY" type="number" step="any" value="${t.pos[1]}"></div>
        <div style="flex:1"><label>Z</label><input class="posZ" type="number" step="any" value="${t.pos[2]}"></div>
        <div style="flex:1"><label>Rotation Rx°</label><input class="rotX" type="number" step="any" value="${t.rot[0]}"></div>
        <div style="flex:1"><label>Ry°</label><input class="rotY" type="number" step="any" value="${t.rot[1]}"></div>
        <div style="flex:1"><label>Rz°</label><input class="rotZ" type="number" step="any" value="${t.rot[2]}"></div>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="addBend secondary">+ Add Bend</button>
      </div>
      <div class="bends"></div>
    `;
    const bendsWrap = document.createElement('div');
    wrap.appendChild(bendsWrap);
    const bendsDiv = wrap.querySelector('.bends');
    t.bends.forEach((b, bi)=> bendsDiv.appendChild(bendRow(t, idx, b, bi)));
    // hooks
    wrap.querySelector('.sel').onclick = () => { currentTubeIdx = idx; refresh(); };
    ['tName','tColor','startTail','endTail','odOverride','posX','posY','posZ','rotX','rotY','rotZ'].forEach(cls=>{
      wrap.querySelectorAll('.'+cls).forEach(el => el.addEventListener('input', ()=>{
        t.name = wrap.querySelector('.tName').value;
        t.color = wrap.querySelector('.tColor').value;
        t.startTail = toNum(wrap.querySelector('.startTail').value);
        t.endTail = toNum(wrap.querySelector('.endTail').value);
        const odv = wrap.querySelector('.odOverride').value.trim();
        t.odOverride = odv === '' ? null : toNum(odv);
        t.pos = [toNum(wrap.querySelector('.posX').value), toNum(wrap.querySelector('.posY').value), toNum(wrap.querySelector('.posZ').value)];
        t.rot = [toNum(wrap.querySelector('.rotX').value), toNum(wrap.querySelector('.rotY').value), toNum(wrap.querySelector('.rotZ').value)];
        render3D();
        updateTotals();
      }));
    });
    wrap.querySelector('.addBend').onclick = () => {
      t.bends.push({angle:59, clr:5.5, straight:10});
      refresh();
    };
    return wrap;
  }

  function bendRow(tube, tidx, b, bidx){
    const row = document.createElement('div');
    row.className = 'bendRow';
    row.innerHTML = `
      <input class="angle" type="number" step="any" value="${b.angle}" title="Angle (°)">
      <input class="clr" type="number" step="any" value="${b.clr}" title="CLR">
      <input class="straight" type="number" step="any" value="${b.straight}" title="Straight after">
      <input class="tgtX" type="number" step="any" value="${b.tgtX??''}" placeholder="Target X (opt)">
      <input class="tgtY" type="number" step="any" value="${b.tgtY??''}" placeholder="Target Y (opt)">
      <div class="x" title="Remove bend">✕</div>
    `;
    function sync(){
      b.angle = toNum(row.querySelector('.angle').value);
      b.clr = toNum(row.querySelector('.clr').value);
      b.straight = toNum(row.querySelector('.straight').value);
      const tx = row.querySelector('.tgtX').value.trim();
      const ty = row.querySelector('.tgtY').value.trim();
      b.tgtX = tx === '' ? null : toNum(tx);
      b.tgtY = ty === '' ? null : toNum(ty);
      render3D();
      updateTotals();
    }
    row.querySelectorAll('input').forEach(el => el.addEventListener('input', sync));
    row.querySelector('.x').onclick = () => { tube.bends.splice(bidx,1); refresh(); };
    return row;
  }

  function refresh(){
    tubesDiv.innerHTML = '';
    tubes.forEach((t, i)=>{
      const card = tubeCard(t, i);
      tubesDiv.appendChild(card);
    });
    render3D();
    updateTotals();
  }

  // === Geometry ===
  // Build path points (centerline) in XY from tails, bends (angles in deg, CLRs), and straights.
  function buildPathPoints(t){
    const k = unitFactor();
    const startTail = t.startTail / k;
    const endTail = t.endTail / k;
    const pts = [];
    let x=0, y=0, heading=0; // radians; 0 along +X
    // start tail
    const seg = 20;
    for(let i=0;i<=seg;i++){ pts.push(new THREE.Vector3(x + (startTail*i/seg), y, 0)); }
    x += startTail;
    t.bends.forEach((b, idx)=>{
      const a = (b.angle||0) * Math.PI/180;
      const R = (b.clr||0) / k;
      const arcLen = a * R;
      // arc discretization
      const steps = Math.max(12, Math.round(arcLen*6));
      for(let i=1;i<=steps;i++){
        const th = heading + a * (i/steps);
        const px = x + R*Math.sin(th) - R*Math.sin(heading);
        const py = y - R*Math.cos(th) + R*Math.cos(heading);
        pts.push(new THREE.Vector3(px, py, 0));
      }
      // update base point to ET
      x = x + R*Math.sin(heading + a) - R*Math.sin(heading);
      y = y - R*Math.cos(heading + a) + R*Math.cos(heading);
      heading += a;

      // optional target solve to auto-suggest straight-after (non-destructive: we don't overwrite user's value)
      if (b.tgtX!=null || b.tgtY!=null){
        const tgtX = (b.tgtX!=null) ? b.tgtX/k : x;
        const tgtY = (b.tgtY!=null) ? b.tgtY/k : y;
        const ex = tgtX - x, ey = tgtY - y;
        const s_need = ex*Math.cos(heading) + ey*Math.sin(heading);
        b._suggestStraight = Math.max(0, s_need) * k; // back to UI units
        b._errX = (ex - Math.max(0,s_need)*Math.cos(heading)) * k;
        b._errY = (ey - Math.max(0,s_need)*Math.sin(heading)) * k;
      } else {
        b._suggestStraight = null; b._errX = null; b._errY = null;
      }

      // straight after
      const s = (b.straight||0) / k;
      for(let i=1;i<=seg;i++){
        const px = x + s*(i/seg)*Math.cos(heading);
        const py = y + s*(i/seg)*Math.sin(heading);
        pts.push(new THREE.Vector3(px, py, 0));
      }
      x += s*Math.cos(heading);
      y += s*Math.sin(heading);
    });
    // end tail
    for(let i=1;i<=seg;i++){ pts.push(new THREE.Vector3(x + (endTail*i/seg), y, 0)); }
    return pts;
  }

  // === 3D scene ===
  let renderer, scene, camera, controls;
  function init3D(){
    const canvas = $('viewer');
    renderer = new THREE.WebGLRenderer({canvas, antialias:true});
    resize();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f0f);
    camera = new THREE.PerspectiveCamera(50, canvas.clientWidth/canvas.clientHeight, 0.1, 10000);
    camera.position.set(40, 30, 60);
    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    const amb = new THREE.AmbientLight(0xffffff, 0.9); scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(30,50,20); scene.add(dir);
    window.addEventListener('resize', resize);
    animate();
  }
  function resize(){
    const canvas = $('viewer');
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer && renderer.setSize(w, h, false);
    camera && (camera.aspect = w/h, camera.updateProjectionMatrix());
  }
  function animate(){
    requestAnimationFrame(animate);
    controls && controls.update();
    renderer && renderer.render(scene, camera);
  }

  let tubeMeshes = [];
  function render3D(){
    if(!scene) return;
    // clear previous meshes
    tubeMeshes.forEach(m => { scene.remove(m); m.geometry.dispose(); });
    tubeMeshes = [];

    const k = unitFactor();
    const defaultOD = toNum($('od').value)/k;

    // axes
    // (skip adding multiple times)

    tubes.forEach((t, idx)=>{
      const pts = buildPathPoints(t);
      if (pts.length < 2) return;
      const path = new THREE.CatmullRomCurve3(pts);
      const od = (t.odOverride!=null ? t.odOverride : defaultOD) / k;
      const radius = Math.max(0.01, od/2);
      const tubularSegments = Math.max(100, Math.min(800, pts.length*3));
      const radialSegments = 16;
      const geometry = new THREE.TubeGeometry(path, tubularSegments, radius, radialSegments, false);
      const color = new THREE.Color(t.color || '#ff5555');
      const material = new THREE.MeshStandardMaterial({color, metalness:0.2, roughness:0.5});
      const mesh = new THREE.Mesh(geometry, material);
      // transform
      mesh.position.set(t.pos[0], t.pos[1], t.pos[2]);
      mesh.rotation.set(THREE.MathUtils.degToRad(t.rot[0]), THREE.MathUtils.degToRad(t.rot[1]), THREE.MathUtils.degToRad(t.rot[2]));
      scene.add(mesh);
      tubeMeshes.push(mesh);
    });
  }

  // === totals & weight (for current tube) ===
  function updateTotals(){
    const k = unitFactor();
    const t = tubes[currentTubeIdx];
    if (!t){ $('straight').textContent='–'; $('arcTotal').textContent='–'; $('total').textContent='–'; $('weight').textContent='–'; return; }
    // approximate straights + arcs
    let straightSum = (t.startTail + t.endTail)/k;
    let arcTotal = 0;
    t.bends.forEach(b=>{
      const R = (b.clr||0)/k, a = (b.angle||0)*Math.PI/180;
      arcTotal += R*a;
      straightSum += (b.straight||0)/k;
    });
    const total = straightSum + arcTotal;
    const od = (toNum($('od').value))/k;
    const wall = (toNum($('wall').value))/k;
    const id = Math.max(0, od - 2*wall);
    const area = Math.PI/4 * (od*od - id*id);
    const weight = total * area * densityLbin3();
    $('straight').textContent = fmtLen(straightSum);
    $('arcTotal').textContent = fmtLen(arcTotal);
    $('total').textContent = fmtLen(total);
    $('weight').textContent = weight.toFixed(2) + ' lb';
  }

  // === exports ===
  function exportCurrentSTL(){
    const t = tubes[currentTubeIdx];
    if (!t) return;
    const exporter = new THREE.STLExporter();
    // Merge current tube mesh to export single
    const mesh = tubeMeshes[currentTubeIdx];
    if (!mesh) return;
    const stl = exporter.parse(mesh);
    downloadText(stl, (t.name||'tube') + '.stl', 'model/stl');
  }
  function exportAllGLB(){
    const exporter = new THREE.GLTFExporter();
    const objs = tubeMeshes.map(m => m);
    exporter.parse(objs, (gltf) => {
      const blob = new Blob([gltf instanceof ArrayBuffer ? gltf : JSON.stringify(gltf)], {type: 'model/gltf-binary'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'tubes.glb';
      a.click(); URL.revokeObjectURL(url);
    }, {binary:true});
  }
  function downloadText(text, filename, mime){
    const blob = new Blob([text], {type: mime || 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 500);
  }

  // === init data ===
  function addTube(defaults){
    const t = Object.assign({
      name: 'Tube ' + (tubes.length+1),
      color: '#ff5555',
      startTail: 2,
      endTail: 2,
      odOverride: null,
      pos: [0,0,0],
      rot: [0,0,0],
      bends: [{angle:59, clr:5.5, straight:10}],
    }, defaults||{});
    tubes.push(t);
    currentTubeIdx = tubes.length-1;
    refresh();
  }

  // hooks
  $('addTube').onclick = ()=> addTube();
  $('example').onclick = ()=>{
    tubes = [];
    addTube({name:'Driver A-Pillar', color:'#ff6666', bends:[{angle:59, clr:5.5, straight:13.3, tgtY:16}]});
    addTube({name:'Passenger A-Pillar', color:'#66aaff', pos:[0,0,20], bends:[{angle:59, clr:5.5, straight:13.3, tgtY:16}]});
  };
  ['units','material','od','wall'].forEach(id => $(id).addEventListener('input', ()=>{ render3D(); updateTotals(); }));
  $('exportSTL').onclick = exportCurrentSTL;
  $('exportGLB').onclick = exportAllGLB;

  // boot
  init3D();
  addTube();
})();