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

  function loadState(){
    try {
      const s = JSON.parse(localStorage.getItem('tube_v5liteplus_v3')||'null');
      if (!s) return;
      $('units').value = s.units || 'in';
      $('material').value = s.material || 'steel';
      $('od').value = s.od ?? '1.75';
      $('wall').value = s.wall ?? '0.120';
      $('tubeName').value = s.tubeName || 'Tube 1';
      $('startTail').value = s.startTail ?? '2';
      $('endTail').value = s.endTail ?? '2';
      bendsDiv.innerHTML = '';
      (s.bends || []).forEach(b => addBendRow(b.angle, b.clr, b.straight, b.tgtRun, b.tgtRise)); // order: Run then Rise in UI? keep tgt fields generic
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
      bends: getBends().map(b => ({angle:b.angle, clr:b.clr, straight:b.straight, tgtRun:b.tgtRun, tgtRise:b.tgtRise}))
    };
    localStorage.setItem('tube_v5liteplus_v3', JSON.stringify(state));
  }

  function addBendRow(angle=59, clr=5.5, straight=10, tgtRun='', tgtRise=''){
    const row = document.createElement('div');
    row.className = 'bendRow';
    row.innerHTML = `
      <div>
        <label>Angle (°)</label>
        <input class="angle" type="number" step="any" value="${angle}">
        <small class="label">θ</small>
      </div>
      <div>
        <label>CLR</label>
        <input class="clr" type="number" step="any" value="${clr}">
        <small class="label">Centerline Radius</small>
      </div>
      <div>
        <label>Straight After</label>
        <input class="straight" type="number" step="any" value="${straight}">
        <small class="label">Leg after bend</small>
      </div>
      <div>
        <label>Target Run</label>
        <input class="tgtRun" type="number" step="any" value="${tgtRun??''}" placeholder="optional">
        <small class="label">End tangent Run</small>
      </div>
      <div>
        <label>Target Rise</label>
        <input class="tgtRise" type="number" step="any" value="${tgtRise??''}" placeholder="optional">
        <small class="label">End tangent Rise</small>
      </div>
      <div class="xBtn"><span class="x" title="Remove bend">Remove</span></div>

      <div class="bendOut">
        <div>ST mark: <span class="stOut">–</span></div>
        <div>ET mark: <span class="etOut">–</span></div>
        <div>Arc length: <span class="arcOut">–</span></div>
        <div>ET (Rise, Run): <span class="etyOut">–</span></div>
        <div>Suggest Straight: <span class="suggest">–</span></div>
        <div>ΔRise / ΔRun: <span class="err">–</span></div>
      </div>
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
      tgtRun: (row.querySelector('.tgtRun').value.trim()==='' ? null : toNum(row.querySelector('.tgtRun').value)),
      tgtRise: (row.querySelector('.tgtRise').value.trim()==='' ? null : toNum(row.querySelector('.tgtRise').value)),
    }));
  }

  let lastETs = []; // store per-bend ET for sketch labels/arrows: [{rise, run}, ...]

  function calc(){
    const k = unitFactor();
    const startTail = toNum($('startTail').value)/k;
    const endTail = toNum($('endTail').value)/k;
    const bends = getBends();

    let straightSum = startTail + endTail;
    let arcTotal = 0;
    let linearPos = startTail;

    // Geometry with Rise vertical, Run horizontal
    // We'll keep internal calc in (run=x, rise=y) traditional math, then map to rise/run naming.
    let run=0, rise=0, heading=0; // heading 0 = +run (right)

    const pathPts = [];
    pathPts.push({run:0, rise:0});
    pathPts.push({run:startTail, rise:0});
    run += startTail;

    lastETs = [];

    bends.forEach((b, idx)=>{
      const a = b.angle*Math.PI/180;
      const R = b.clr/k;
      const arc = R*a;

      const stMark = linearPos;
      const etMark = stMark + arc;

      const run_et = run + R*Math.sin(heading + a) - R*Math.sin(heading);
      const rise_et = rise - R*Math.cos(heading + a) + R*Math.cos(heading);
      const heading_after = heading + a;

      // update labels
      b.el.querySelector('.stOut').textContent = fmtLen(stMark);
      b.el.querySelector('.etOut').textContent = fmtLen(etMark);
      b.el.querySelector('.arcOut').textContent = fmtLen(arc);
      b.el.querySelector('.etyOut').textContent = `(Rise ${ (rise_et*(k==25.4?25.4:1)).toFixed(2) }, Run ${ (run_et*(k==25.4?25.4:1)).toFixed(2) } ${$('units').value})`;

      // target suggestion/error (project along heading_after)
      if (b.tgtRun!==null || b.tgtRise!==null){
        const tgtRun = (b.tgtRun!==null)? b.tgtRun/k : run_et;
        const tgtRise = (b.tgtRise!==null)? b.tgtRise/k : rise_et;
        const ex = tgtRun - run_et, ey = tgtRise - rise_et;
        const s_need = ex*Math.cos(heading_after) + ey*Math.sin(heading_after);
        const suggest = Math.max(0, s_need);
        const errRun = (ex - suggest*Math.cos(heading_after))* (k==25.4?25.4:1);
        const errRise = (ey - suggest*Math.sin(heading_after))* (k==25.4?25.4:1);
        b.el.querySelector('.suggest').textContent = fmtLen(suggest);
        b.el.querySelector('.err').textContent = fDelta(errRise, errRun);
      } else {
        b.el.querySelector('.suggest').textContent = '–';
        b.el.querySelector('.err').textContent = '–';
      }

      pathPts.push({run:run_et, rise:rise_et});
      lastETs.push({rise: rise_et, run: run_et, idx: idx+1});

      const s = b.straight / k;
      const run_next = run_et + s*Math.cos(heading_after);
      const rise_next = rise_et + s*Math.sin(heading_after);
      pathPts.push({run:run_next, rise:rise_next});

      straightSum += s;
      arcTotal += arc;
      linearPos = etMark + s;
      run = run_next; rise = rise_next; heading = heading_after;
    });

    pathPts.push({run:run+endTail, rise:rise});

    const total = straightSum + arcTotal;

    const od = toNum($('od').value)/k;
    const wall = toNum($('wall').value)/k;
    const id = max0(od - 2*wall);
    const area = Math.PI/4 * (od*od - id*id);
    const weight = total * area * densityLbin3();

    $('straight').textContent = fmtLen(straightSum);
    $('arcTotal').textContent = fmtLen(arcTotal);
    $('total').textContent = fmtLen(total);
    $('weight').textContent = weight.toFixed(2) + ' lb';

    drawSketch(pathPts, lastETs);
  }

  function max0(v){ return v<0?0:v; }
  function fDelta(rise, run){
    return `ΔRise ${rise.toFixed(2)}, ΔRun ${run.toFixed(2)} ${$('units').value}`;
  }

  function niceStep(range){
    const raw = range/8;
    const mag = Math.pow(10, Math.floor(Math.log10(raw||1)));
    const norm = raw / mag;
    let step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    return step * mag;
  }

  function drawArrow(ctx, x1,y1, x2,y2){
    // line
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    // arrow head at (x2,y2)
    const ang = Math.atan2(y2-y1, x2-x1);
    const L = 8;
    ctx.beginPath();
    ctx.moveTo(x2,y2);
    ctx.lineTo(x2 - L*Math.cos(ang - Math.PI/6), y2 - L*Math.sin(ang - Math.PI/6));
    ctx.lineTo(x2 - L*Math.cos(ang + Math.PI/6), y2 - L*Math.sin(ang + Math.PI/6));
    ctx.closePath();
    ctx.fill();
  }

  function drawSketch(pathPts, ets){
    const c = $('sketch');
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    if (pathPts.length<2) return;

    // bounds in run/rise
    let minRun=pathPts[0].run, maxRun=pathPts[0].run, minRise=pathPts[0].rise, maxRise=pathPts[0].rise;
    pathPts.forEach(p=>{ minRun=Math.min(minRun,p.run); maxRun=Math.max(maxRun,p.run); minRise=Math.min(minRise,p.rise); maxRise=Math.max(maxRise,p.rise); });
    // include origin for dims
    minRun = Math.min(0, minRun); minRise = Math.min(0, minRise);

    const pad = 40;
    const w = c.width - pad*2, h = c.height - pad*2;
    const sx = w / Math.max(1e-6, (maxRun-minRun));
    const sy = h / Math.max(1e-6, (maxRise-minRise));
    const s = Math.min(sx, sy);
    const x0 = pad + (w - s*(maxRun-minRun))/2 - s*minRun; // maps run->x
    const y0 = pad + h - (h - s*(maxRise-minRise))/2 + s*minRise; // maps rise->y (invert)

    // grid
    const units = $('units').value;
    const stepRun = niceStep(maxRun-minRun);
    const stepRise = niceStep(maxRise-minRise);
    ctx.lineWidth = 1; ctx.strokeStyle = '#1f1f1f'; ctx.fillStyle='#777'; ctx.font='10px system-ui';

    for(let gx=Math.ceil(minRun/stepRun)*stepRun; gx<=maxRun; gx+=stepRun){
      const X = x0 + s*gx; ctx.beginPath(); ctx.moveTo(X, pad); ctx.lineTo(X, c.height-pad); ctx.stroke();
      ctx.fillText(gx.toFixed(2), X+2, c.height-pad+12);
    }
    for(let gy=Math.ceil(minRise/stepRise)*stepRise; gy<=maxRise; gy+=stepRise){
      const Y = y0 - s*gy; ctx.beginPath(); ctx.moveTo(pad, Y); ctx.lineTo(c.width-pad, Y); ctx.stroke();
      ctx.fillText(gy.toFixed(2), pad-30, Y+4);
    }

    // axes
    ctx.strokeStyle='#444'; ctx.lineWidth=1.5;
    // Run axis (horizontal through rise=0)
    ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(c.width-pad, y0); ctx.stroke();
    // Rise axis (vertical through run=0)
    ctx.beginPath(); ctx.moveTo(x0, pad); ctx.lineTo(x0, c.height-pad); ctx.stroke();
    ctx.fillStyle='#aaa'; ctx.font='11px system-ui';
    ctx.fillText('Run →', c.width - 70, y0 - 6);
    ctx.save(); ctx.translate(x0 + 10, pad + 10); ctx.rotate(-Math.PI/2); ctx.fillText('Rise ↑', 0, 0); ctx.restore();

    // path
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#7cf';
    ctx.beginPath();
    ctx.moveTo(x0 + s*pathPts[0].run, y0 - s*pathPts[0].rise);
    for(let i=1;i<pathPts.length;i++){
      ctx.lineTo(x0 + s*pathPts[i].run, y0 - s*pathPts[i].rise);
    }
    ctx.stroke();

    // overall dims
    const overallRun = maxRun - minRun, overallRise = maxRise - minRise;
    ctx.strokeStyle='#aaa'; ctx.fillStyle='#ddd'; ctx.lineWidth=1;

    // overall run
    const yDim = c.height - pad + 14;
    ctx.beginPath(); ctx.moveTo(x0 + s*minRun, yDim-4); ctx.lineTo(x0 + s*maxRun, yDim-4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + s*minRun, yDim-10); ctx.lineTo(x0 + s*minRun, yDim+2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + s*maxRun, yDim-10); ctx.lineTo(x0 + s*maxRun, yDim+2); ctx.stroke();
    ctx.fillText(`Width (Run): ${overallRun.toFixed(2)} ${units}`, x0 + s*(minRun+maxRun)/2 - 50, yDim-12);

    // overall rise
    const xDim = pad - 14;
    ctx.beginPath(); ctx.moveTo(xDim+4, y0 - s*minRise); ctx.lineTo(xDim+4, y0 - s*maxRise); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xDim-2, y0 - s*minRise); ctx.lineTo(xDim+10, y0 - s*minRise); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xDim-2, y0 - s*maxRise); ctx.lineTo(xDim+10, y0 - s*maxRise); ctx.stroke();
    ctx.save(); ctx.translate(xDim-8, y0 - s*(minRise+maxRise)/2); ctx.rotate(-Math.PI/2);
    ctx.fillText(`Height (Rise): ${overallRise.toFixed(2)} ${units}`, 0, 0);
    ctx.restore();

    // per-bend arrows from axes to ET points
    ctx.setLineDash([5,4]); ctx.strokeStyle='#bbb'; ctx.fillStyle='#ddd';
    ets.forEach(pt=>{
      const Xp = x0 + s*pt.run; const Yp = y0 - s*pt.rise;

      // Horizontal arrow from Rise axis (run=0) to point (Run dimension)
      ctx.beginPath(); ctx.setLineDash([5,4]);
      drawArrow(ctx, x0, Yp, Xp, Yp);
      // Label near midpoint
      ctx.fillText(`B${pt.idx} Run: ${pt.run.toFixed(2)} ${units}`, x0 + (Xp - x0)/2 - 40, Yp - 6);

      // Vertical arrow from Run axis (rise=0) to point (Rise dimension)
      ctx.beginPath(); ctx.setLineDash([5,4]);
      drawArrow(ctx, Xp, y0, Xp, Yp);
      // Label
      ctx.save();
      ctx.translate(Xp + 8, y0 - (y0 - Yp)/2);
      ctx.rotate(-Math.PI/2);
      ctx.fillText(`B${pt.idx} Rise: ${pt.rise.toFixed(2)} ${units}`, 0, 0);
      ctx.restore();
    });
    ctx.setLineDash([]);
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
    const headers = ['#','Start Mark','Angle°','CLR','Arc','Straight','ET (Rise, Run)','ΔRise/ΔRun'];
    const colX = [0.5, 0.8, 1.5, 2.1, 2.6, 3.0, 3.9, 5.1];
    doc.setFontSize(10); doc.setFont(undefined,'bold');
    headers.forEach((h,i)=> doc.text(h, colX[i], y));
    doc.setFont(undefined,'normal');
    y += 0.2;

    // recompute ETs to list table (Rise,Run)
    const k = unitFactor();
    const startTail = toNum($('startTail').value)/k;
    const bends = getBends();
    let run=0, rise=0, heading=0; run += startTail;

    for (let idx=0; idx<bends.length; idx++){
      const b = bends[idx];
      const a = b.angle*Math.PI/180;
      const R = b.clr/k;
      const arc = R*a;

      const run_et = run + R*Math.sin(heading + a) - R*Math.sin(heading);
      const rise_et = rise - R*Math.cos(heading + a) + R*Math.cos(heading);
      const heading_after = heading + a;

      let errRun='–', errRise='–';
      if (b.tgtRun!==null || b.tgtRise!==null){
        const tgtRun = (b.tgtRun!==null)? b.tgtRun/k : run_et;
        const tgtRise = (b.tgtRise!==null)? b.tgtRise/k : rise_et;
        const ex = tgtRun - run_et, ey = tgtRise - rise_et;
        const s_need = ex*Math.cos(heading_after) + ey*Math.sin(heading_after);
        const suggest = Math.max(0, s_need);
        errRun = (ex - suggest*Math.cos(heading_after))* (units==='mm'?25.4:1);
        errRise = (ey - suggest*Math.sin(heading_after))* (units==='mm'?25.4:1);
      }

      const stMark = (startTail + sumUpTo(bends, idx, k)).toFixed(2);
      doc.text(String(idx+1), colX[0], y);
      doc.text(stMark, colX[1], y);
      doc.text(b.angle.toFixed(2), colX[2], y);
      doc.text((b.clr/unitFactor()).toFixed(2) + ' ' + $('units').value, colX[3], y);
      doc.text((arc* (units==='mm'?25.4:1)).toFixed(2) + ' ' + units, colX[4], y);
      doc.text((b.straight).toFixed(2) + ' ' + units, colX[5], y);
      doc.text(`(Rise ${(rise_et* (units==='mm'?25.4:1)).toFixed(2)}, Run ${(run_et* (units==='mm'?25.4:1)).toFixed(2)})`, colX[6], y);
      if (errRun==='–') doc.text('–', colX[7], y);
      else doc.text(`ΔRise ${errRise.toFixed(2)}, ΔRun ${errRun.toFixed(2)} ${units}`, colX[7], y);
      y += 0.2;

      const s = b.straight / k;
      run = run_et + s*Math.cos(heading_after);
      rise = rise_et + s*Math.sin(heading_after);
      heading = heading_after;
    }

    const sketch = $('sketch');
    const imgData = sketch.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 0.5, 3.7, 7.5, 2.6);

    doc.setFontSize(11);
    doc.text(`Total Cut Length: ${total}`, 0.5, 6.5);
    doc.text(`Estimated Weight: ${weight}`, 4.5, 6.5);
    doc.text("All marks from cut end along tube centerline. Side view (Rise vs Run).", 0.5, 6.7);

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

  // Hooks
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
    // Example: one 59° bend targeting Rise 16 (typical roll bar leg)
    addBendRow(59, 5.5, 13.33, 0, 16);
    calc(); saveState();
  };
  ['units','material','od','wall','tubeName','startTail','endTail'].forEach(id => $(id).addEventListener('input', ()=>{ calc(); saveState(); }));
  $('exportPDF').onclick = exportPDF;

  // Initialize
  loadState();
  if (bendsDiv.children.length===0) addBendRow();
  calc();

  // Service worker
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js');
  }
})();