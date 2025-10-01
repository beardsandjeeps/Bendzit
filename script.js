(() => {
  const $ = (id) => document.getElementById(id);
  const bendsDiv = $('bends');
  const toNum = (v) => { v = parseFloat(v); return isNaN(v) ? 0 : v; };
  const unitFactor = () => $('units').value === 'mm' ? 25.4 : 1; // UI -> inches
  const fmtLen = (inches) => {
    const u = $('units').value;
    const val = u === 'mm' ? inches*25.4 : inches;
    return val.toFixed(2) + ' ' + u;
  };
  const densityLbin3 = () => $('material').value === 'aluminum' ? 0.0975 : 0.283;

  // AUTOSAVE
  function loadState(){
    try {
      const s = JSON.parse(localStorage.getItem('tube_v5lite_state')||'null');
      if (!s) return;
      $('units').value = s.units || 'in';
      $('material').value = s.material || 'steel';
      $('od').value = s.od ?? '1.75';
      $('wall').value = s.wall ?? '0.120';
      $('tubeName').value = s.tubeName || 'Tube 1';
      $('startTail').value = s.startTail ?? '2';
      $('endTail').value = s.endTail ?? '2';
      bendsDiv.innerHTML = '';
      (s.bends || []).forEach(b => addBendRow(b.angle, b.clr, b.straight, b.tgtX, b.tgtY));
    } catch(e){}
  }
  function saveState(){
    const state = {
      units: $('units').value,
      material: $('material').value,
      od: $('od').value,
      wall: $('wall').value,
      tubeName: $('tubeName').value,
      startTail: $('startTail').value,
      endTail: $('endTail').value,
      bends: getBends().map(b => ({angle:b.angle, clr:b.clr, straight:b.straight, tgtX:b.tgtX, tgtY:b.tgtY}))
    };
    localStorage.setItem('tube_v5lite_state', JSON.stringify(state));
  }

  function addBendRow(angle=59, clr=5.5, straight=10, tgtX='', tgtY=''){
    const row = document.createElement('div');
    row.className = 'bendRow';
    row.innerHTML = `
      <input class="angle" type="number" step="any" value="${angle}" title="Angle (°)">
      <input class="clr" type="number" step="any" value="${clr}" title="CLR">
      <input class="straight" type="number" step="any" value="${straight}" title="Straight after">
      <input class="tgtX" type="number" step="any" value="${tgtX??''}" placeholder="Target X (opt)">
      <input class="tgtY" type="number" step="any" value="${tgtY??''}" placeholder="Target Y (opt)">
      <div class="x" title="Remove bend">✕</div>
      <div class="muted" style="grid-column:1/-1">Suggested straight: <span class="suggest">–</span> • Error ΔX/ΔY: <span class="err">–</span></div>
    `;
    row.querySelectorAll('input').forEach(el => el.addEventListener('input', ()=>{ calc(); saveState(); }));
    row.querySelector('.x').onclick = () => { row.remove(); calc(); saveState(); };
    bendsDiv.appendChild(row);
    calc(); saveState();
  }
  function getBends(){
    return Array.from(bendsDiv.querySelectorAll('.bendRow')).map((row, i)=> ({
      el: row,
      angle: toNum(row.querySelector('.angle').value),
      clr: toNum(row.querySelector('.clr').value),
      straight: toNum(row.querySelector('.straight').value),
      tgtX: (row.querySelector('.tgtX').value.trim()==='' ? null : toNum(row.querySelector('.tgtX').value)),
      tgtY: (row.querySelector('.tgtY').value.trim()==='' ? null : toNum(row.querySelector('.tgtY').value)),
    }));
  }

  function calc(){
    const k = unitFactor();
    const startTail = toNum($('startTail').value)/k;
    const endTail = toNum($('endTail').value)/k;
    const bends = getBends();

    let markPos = startTail;
    let straightSum = startTail + endTail;
    let arcTotal = 0;

    let X=0, Y=0, heading=0;
    const pts = [];
    pts.push({x:0,y:0});
    pts.push({x:startTail,y:0});
    X += startTail;

    bends.forEach((b, idx)=>{
      const a = b.angle*Math.PI/180;
      const R = b.clr/k;
      const arc = R*a;

      const X_et = X + R*Math.sin(heading + a) - R*Math.sin(heading);
      const Y_et = Y - R*Math.cos(heading + a) + R*Math.cos(heading);
      const heading_after = heading + a;

      // targets
      if (b.tgtX!==null || b.tgtY!==null){
        const tgtX = (b.tgtX!==null)? b.tgtX/k : X_et;
        const tgtY = (b.tgtY!==null)? b.tgtY/k : Y_et;
        const ex = tgtX - X_et, ey = tgtY - Y_et;
        const s_need = ex*Math.cos(heading_after) + ey*Math.sin(heading_after);
        const suggest = Math.max(0, s_need);
        const errX = (ex - suggest*Math.cos(heading_after))*k;
        const errY = (ey - suggest*Math.sin(heading_after))*k;
        b.el.querySelector('.suggest').textContent = fmtLen(suggest);
        b.el.querySelector('.err').textContent = `${errX.toFixed(2)}, ${errY.toFixed(2)}`;
      } else {
        b.el.querySelector('.suggest').textContent = '–';
        b.el.querySelector('.err').textContent = '–';
      }

      pts.push({x:X_et, y:Y_et});

      const s = b.straight / k;
      const X_next = X_et + s*Math.cos(heading_after);
      const Y_next = Y_et + s*Math.sin(heading_after);
      pts.push({x:X_next, y:Y_next});

      straightSum += s;
      arcTotal += arc;
      markPos = markPos + arc + s;
      X = X_next; Y = Y_next; heading = heading_after;
    });

    pts.push({x:X+endTail, y:Y});

    const total = straightSum + arcTotal;

    const od = toNum($('od').value)/k;
    const wall = toNum($('wall').value)/k;
    const id = Math.max(0, od - 2*wall);
    const area = Math.PI/4 * (od*od - id*id);
    const weight = total * area * densityLbin3();

    $('straight').textContent = fmtLen(straightSum);
    $('arcTotal').textContent = fmtLen(arcTotal);
    $('total').textContent = fmtLen(total);
    $('weight').textContent = weight.toFixed(2) + ' lb';

    drawSketch(pts, bends.length);
  }

  function drawSketch(pts, bendCount){
    const c = $('sketch');
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    if (pts.length<2) return;
    let minX=pts[0].x, maxX=pts[0].x, minY=pts[0].y, maxY=pts[0].y;
    pts.forEach(p=>{ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
    const pad = 20;
    const w = c.width - pad*2, h = c.height - pad*2;
    const sx = w / Math.max(1e-6, (maxX-minX));
    const sy = h / Math.max(1e-6, (maxY-minY));
    const s = Math.min(sx, sy);
    const x0 = pad + (w - s*(maxX-minX))/2 - s*minX;
    const y0 = pad + h - (h - s*(maxY-minY))/2 + s*minY;

    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(c.width-pad, y0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, pad); ctx.lineTo(x0, c.height-pad); ctx.stroke();

    ctx.lineWidth = 2; ctx.strokeStyle = '#7cf';
    ctx.beginPath();
    ctx.moveTo(x0 + s*pts[0].x, y0 - s*pts[0].y);
    for(let i=1;i<pts.length;i++){
      ctx.lineTo(x0 + s*pts[i].x, y0 - s*pts[i].y);
    }
    ctx.stroke();

    ctx.fillStyle = '#ddd'; ctx.font = '12px system-ui';
    let b=1;
    for(let i=2;i<pts.length-1;i+=3){
      if (b>bendCount) break;
      ctx.fillText('B'+(b++), x0 + s*pts[i].x + 4, y0 - s*pts[i].y - 4);
    }
  }

  async function exportPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:'portrait', unit:'in', format:'letter'});

    const name = $('tubeName').value;
    const units = $('units').value;
    const od = $('od').value, wall = $('wall').value;
    const total = $('total').textContent;
    const weight = $('weight').textContent;

    doc.setFontSize(16);
    doc.text(`${name} — Cut Sheet`, 0.5, 0.7);
    doc.setFontSize(10);
    doc.text(`OD×Wall: ${od}×${wall} ${units}`, 0.5, 1.0);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 0.5, 1.2);

    let y = 1.5;
    const headers = ['#','Start Mark','Angle°','CLR','Arc','Straight','ET (X,Y)','ΔX/ΔY'];
    const colX = [0.5, 0.8, 1.5, 2.1, 2.6, 3.0, 3.7, 4.9];
    doc.setFontSize(10); doc.setFont(undefined,'bold');
    headers.forEach((h,i)=> doc.text(h, colX[i], y));
    doc.setFont(undefined,'normal');
    y += 0.2;

    const k = unitFactor();
    const startTail = toNum($('startTail').value)/k;
    const endTail = toNum($('endTail').value)/k;
    let X=0, Y=0, heading=0;
    X += startTail;
    const bends = getBends();

    for (let idx=0; idx<bends.length; idx++){
      const b = bends[idx];
      const a = b.angle*Math.PI/180;
      const R = b.clr/k;
      const arc = R*a;
      const X_et = X + R*Math.sin(heading + a) - R*Math.sin(heading);
      const Y_et = Y - R*Math.cos(heading + a) + R*Math.cos(heading);
      const heading_after = heading + a;

      let suggest = null, errX='–', errY='–';
      if (b.tgtX!==null || b.tgtY!==null){
        const tgtX = (b.tgtX!==null)? b.tgtX/k : X_et;
        const tgtY = (b.tgtY!==null)? b.tgtY/k : Y_et;
        const ex = tgtX - X_et, ey = tgtY - Y_et;
        const s_need = ex*Math.cos(heading_after) + ey*Math.sin(heading_after);
        suggest = Math.max(0, s_need);
        errX = (ex - suggest*Math.cos(heading_after))*k;
        errY = (ey - suggest*Math.sin(heading_after))*k;
      }

      const stMark = (startTail + sumUpTo(bends, idx, k)).toFixed(2);
      doc.text(String(idx+1), colX[0], y);
      doc.text(stMark, colX[1], y);
      doc.text(b.angle.toFixed(2), colX[2], y);
      doc.text((b.clr/unitFactor()).toFixed(2) + ' ' + $('units').value, colX[3], y);
      doc.text((arc* (units==='mm'?25.4:1)).toFixed(2) + ' ' + units, colX[4], y);
      doc.text((b.straight).toFixed(2) + ' ' + units, colX[5], y);
      doc.text(`(${(X_et* (units==='mm'?25.4:1)).toFixed(2)}, ${(Y_et* (units==='mm'?25.4:1)).toFixed(2)})`, colX[6], y);
      if (errX==='–') doc.text('–', colX[7], y);
      else doc.text(`${errX.toFixed(2)}, ${errY.toFixed(2)} ${units}`, colX[7], y);
      y += 0.2;

      const s = b.straight / k;
      X = X_et + s*Math.cos(heading_after);
      Y = Y_et + s*Math.sin(heading_after);
      heading = heading_after;
    }

    const sketch = $('sketch');
    const imgData = sketch.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 0.5, 3.8, 7.5, 2.2);

    doc.setFontSize(11);
    doc.text(`Total Cut Length: ${total}`, 0.5, 6.3);
    doc.text(`Estimated Weight: ${weight}`, 4.5, 6.3);
    doc.text("All marks from cut end along tube centerline. Units as shown.", 0.5, 6.5);

    doc.save((name||'Tube') + '_CutSheet.pdf');
  }

  function sumUpTo(bends, idx, k){
    let s = 0;
    for(let i=0;i<idx;i++){
      const b = bends[i];
      const R = b.clr/k, a = b.angle*Math.PI/180;
      s += R*a + (b.straight/k);
    }
    return s;
  }

  $('addBend').onclick = ()=> addBendRow();
  $('example').onclick = ()=>{
    $('tubeName').value = 'Driver A-Pillar';
    $('startTail').value = '2';
    $('endTail').value = '2';
    $('units').value = 'in';
    $('material').value = 'steel';
    $('od').value = '1.75';
    $('wall').value = '0.120';
    bendsDiv.innerHTML = '';
    addBendRow(59, 5.5, 13.33, '', 16);
    calc(); saveState();
  };
  ['units','material','od','wall','tubeName','startTail','endTail'].forEach(id => $(id).addEventListener('input', ()=>{ calc(); saveState(); }));
  $('exportPDF').onclick = exportPDF;

  loadState();
  if (bendsDiv.children.length===0) addBendRow();
  calc();

  // register service worker
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js');
  }
})();