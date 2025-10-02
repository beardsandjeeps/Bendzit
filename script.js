document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const bendsDiv = $('bends');
  const toNum = (v) => { v = parseFloat(v); return isNaN(v) ? 0 : v; };
  const unitFactor = () => $('units').value === 'mm' ? 25.4 : 1;
  const fmtLen = (inches) => {
    const u = $('units').value;
    const val = u === 'mm' ? inches*25.4 : inches;
    return val.toFixed(2) + ' ' + u;
  };
  const densityLbin3 = () => $('material').value === 'aluminum' ? 0.0975 : 0.283;

  function loadState(){
    try {
      const s = JSON.parse(localStorage.getItem('tube_pwa_v411_pwabuilder')||'null');
      if (!s) return;
      $('units').value = s.units || 'in';
      $('material').value = s.material || 'steel';
      $('od').value = s.od ?? '1.75';
      $('wall').value = s.wall ?? '0.120';
      $('tubeName').value = s.tubeName || 'Tube 1';
      $('startTail').value = s.startTail ?? '2';
      $('endTail').value = s.endTail ?? '2';
      $('notched').checked = !!s.notched;
      $('benderOffset').value = s.benderOffset ?? '0';
      bendsDiv.innerHTML = '';
      (s.bends || []).forEach(b => addBendRow(b.angle, b.clr, b.straight, b.tgtRun, b.tgtRise, b.stManual));
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
      notched: $('notched').checked,
      benderOffset: $('benderOffset').value,
      bends: getBends().map(b => ({angle:b.angle, clr:b.clr, straight:b.straight, tgtRun:b.tgtRun, tgtRise:b.tgtRise, stManual:b.stManual}))
    };
    localStorage.setItem('tube_pwa_v411_pwabuilder', JSON.stringify(state));
  }

  function addBendRow(angle=59, clr=5.5, straight=10, tgtRun='', tgtRise='', stManual=''){
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
      <div>
        <label>Start of Bend (manual)</label>
        <input class="stManual" type="number" step="any" value="${stManual??''}" placeholder="optional">
        <small class="label">Overrides computed ST for pointer mark</small>
      </div>
      <div class="xBtn"><span class="x" title="Remove bend">Remove</span></div>

      <div class="bendOut">
        <div>ST mark: <span class="stOut">–</span></div>
        <div>Pointer mark (ST − offset): <span class="ptrOut">–</span></div>
        <div>Arc length: <span class="arcOut">–</span></div>
        <div>ET (Rise, Run): <span class="etyOut">–</span></div>
        <div>Suggest Straight: <span class="suggest">–</span></div>
        <div>ΔRise / ΔRun: <span class="err">–</span></div>
        <div>Δ from manual ST: <span class="stDelta">–</span></div>
      </div>
    `;
    row.querySelectorAll('input').forEach(el => el.addEventListener('input', ()=>{ calc(); saveState(); }));
    row.querySelector('.x').onclick = () => { row.remove(); calc(); saveState(); };
    bendsDiv.appendChild(row);
    calc(); saveState();
  }

  function getBends(){
    return Array.from(bendsDiv.querySelectorAll('.bendRow')).map((row)=> ({
      el: row,
      angle: parseFloat(row.querySelector('.angle').value||'0'),
      clr: parseFloat(row.querySelector('.clr').value||'0'),
      straight: parseFloat(row.querySelector('.straight').value||'0'),
      tgtRun: (row.querySelector('.tgtRun').value.trim()==='' ? null : parseFloat(row.querySelector('.tgtRun').value)),
      tgtRise: (row.querySelector('.tgtRise').value.trim()==='' ? null : parseFloat(row.querySelector('.tgtRise').value)),
      stManual: (row.querySelector('.stManual').value.trim()==='' ? null : parseFloat(row.querySelector('.stManual').value)),
    }));
  }

  let lastETs = [];

  function calc(){
    const units = $('units').value;
    const toIn = (x)=> (units==='mm' ? x/25.4 : x);
    const toUI = (x)=> (units==='mm' ? x*25.4 : x);

    const notched = $('notched').checked;
    const benderOffset = parseFloat(($('benderOffset').value||'0'));

    const od_ui = parseFloat(($('od').value||'0'));
    const notchAdj_ui = notched ? (od_ui/3.0) : 0;

    const startTail = Math.max(0, toIn(parseFloat(($('startTail').value||'0')) - notchAdj_ui));
    const endTail = toIn(parseFloat(($('endTail').value||'0')));

    const bends = getBends();

    let straightSum = startTail + endTail;
    let arcTotal = 0;
    let linearPos = startTail;

    let run=0, rise=0, heading=0;
    const pathPts = [];
    pathPts.push({run:0, rise:0});
    pathPts.push({run:startTail, rise:0});
    run += startTail;

    lastETs = [];

    bends.forEach((b, idx)=>{
      const a = b.angle*Math.PI/180 || 0;
      const R = toIn(b.clr);
      const arc = R*a;

      let stComputed = linearPos;
      let stMark = stComputed;
      if (b.stManual!==null){ stMark = toIn(b.stManual); }

      const run_et = run + R*Math.sin(heading + a) - R*Math.sin(heading);
      const rise_et = rise - R*Math.cos(heading + a) + R*Math.cos(heading);
      const heading_after = heading + a;

      const st_ui = toUI(stMark);
      const ptr_ui = Math.max(0, st_ui - benderOffset);
      b.el.querySelector('.stOut').textContent = fmtLen(stMark);
      b.el.querySelector('.ptrOut').textContent = ptr_ui.toFixed(2) + ' ' + units;

      b.el.querySelector('.arcOut').textContent = fmtLen(arc);
      b.el.querySelector('.etyOut').textContent = `(Rise ${toUI(rise_et).toFixed(2)}, Run ${toUI(run_et).toFixed(2)} ${units})`;

      if (b.tgtRun!==null || b.tgtRise!==null){
        const tgtRun = (b.tgtRun!==null)? toIn(b.tgtRun) : run_et;
        const tgtRise = (b.tgtRise!==null)? toIn(b.tgtRise) : rise_et;
        const ex = tgtRun - run_et, ey = tgtRise - rise_et;
        const s_need = ex*Math.cos(heading_after) + ey*Math.sin(heading_after);
        const suggest = Math.max(0, s_need);
        const errRun = toUI(ex - suggest*Math.cos(heading_after));
        const errRise = toUI(ey - suggest*Math.sin(heading_after));
        b.el.querySelector('.suggest').textContent = fmtLen(suggest);
        b.el.querySelector('.err').textContent = `ΔRise ${errRise.toFixed(2)}, ΔRun ${errRun.toFixed(2)} ${units}`;
      } else {
        b.el.querySelector('.suggest').textContent = '–';
        b.el.querySelector('.err').textContent = '–';
      }

      if (b.stManual!==null){
        const delta_ui = toUI(stMark - stComputed);
        b.el.querySelector('.stDelta').textContent = (delta_ui>=0?'+':'') + delta_ui.toFixed(2) + ' ' + units;
      } else {
        b.el.querySelector('.stDelta').textContent = '–';
      }

      pathPts.push({run:run_et, rise:rise_et});
      lastETs.push({rise: rise_et, run: run_et, idx: idx+1});

      const s = toIn(b.straight);
      const run_next = run_et + s*Math.cos(heading_after);
      const rise_next = rise_et + s*Math.sin(heading_after);
      pathPts.push({run:run_next, rise:rise_next});

      straightSum += s;
      arcTotal += arc;
      linearPos = stComputed + arc + s;
      run = run_next; rise = rise_next; heading = heading_after;
    });

    pathPts.push({run:run+endTail, rise:rise});

    const total = straightSum + arcTotal;

    const od_in = toIn(od_ui);
    const wall_in = toIn(parseFloat(($('wall').value||'0')));
    const id = Math.max(0, od_in - 2*wall_in);
    const area = Math.PI/4 * (od_in*od_in - id*id);
    const weight = total * area * densityLbin3();

    $('straight').textContent = fmtLen(straightSum);
    $('arcTotal').textContent = fmtLen(arcTotal);
    $('total').textContent = fmtLen(total);
    $('weight').textContent = weight.toFixed(2) + ' lb';

    drawSketch(pathPts, lastETs);
  }

  function niceStep(range){
    const raw = range/8 || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    return step * mag;
  }
  function drawArrow(ctx, x1,y1, x2,y2){
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
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
    const c = document.getElementById('sketch');
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    if (pathPts.length<2) return;

    let minRun=pathPts[0].run, maxRun=pathPts[0].run, minRise=pathPts[0].rise, maxRise=pathPts[0].rise;
    pathPts.forEach(p=>{ minRun=Math.min(minRun,p.run); maxRun=Math.max(maxRun,p.run); minRise=Math.min(minRise,p.rise); maxRise=Math.max(maxRise,p.rise); });
    minRun = Math.min(0, minRun); minRise = Math.min(0, minRise);

    const pad = 40;
    const w = c.width - pad*2, h = c.height - pad*2;
    const sx = w / Math.max(1e-6, (maxRun-minRun));
    const sy = h / Math.max(1e-6, (maxRise-minRise));
    const s = Math.min(sx, sy);
    const x0 = pad + (w - s*(maxRun-minRun))/2 - s*minRun;
    const y0 = pad + h - (h - s*(maxRise-minRise))/2 + s*minRise;

    const units = document.getElementById('units').value;
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

    ctx.strokeStyle='#444'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(c.width-pad, y0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, pad); ctx.lineTo(x0, c.height-pad); ctx.stroke();
    ctx.fillStyle='#aaa'; ctx.font='11px system-ui';
    ctx.fillText('Run →', c.width - 70, y0 - 6);
    ctx.save(); ctx.translate(x0 + 10, pad + 10); ctx.rotate(-Math.PI/2); ctx.fillText('Rise ↑', 0, 0); ctx.restore();

    ctx.lineWidth = 2.5; ctx.strokeStyle = '#7cf';
    ctx.beginPath();
    ctx.moveTo(x0 + s*pathPts[0].run, y0 - s*pathPts[0].rise);
    for(let i=1;i<pathPts.length;i++){
      ctx.lineTo(x0 + s*pathPts[i].run, y0 - s*pathPts[i].rise);
    }
    ctx.stroke();

    const overallRun = maxRun - minRun, overallRise = maxRise - minRise;
    ctx.strokeStyle='#aaa'; ctx.fillStyle='#ddd'; ctx.lineWidth=1;

    const yDim = c.height - pad + 14;
    ctx.beginPath(); ctx.moveTo(x0 + s*minRun, yDim-4); ctx.lineTo(x0 + s*maxRun, yDim-4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + s*minRun, yDim-10); ctx.lineTo(x0 + s*minRun, yDim+2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + s*maxRun, yDim-10); ctx.lineTo(x0 + s*maxRun, yDim+2); ctx.stroke();
    ctx.fillText(`Width (Run): ${overallRun.toFixed(2)} ${units}`, x0 + s*(minRun+maxRun)/2 - 50, yDim-12);

    const xDim = pad - 14;
    ctx.beginPath(); ctx.moveTo(xDim+4, y0 - s*minRise); ctx.lineTo(xDim+4, y0 - s*maxRise); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xDim-2, y0 - s*minRise); ctx.lineTo(xDim+10, y0 - s*minRise); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xDim-2, y0 - s*maxRise); ctx.lineTo(xDim+10, y0 - s*maxRise); ctx.stroke();
    ctx.save(); ctx.translate(xDim-8, y0 - s*(minRise+maxRise)/2); ctx.rotate(-Math.PI/2);
    ctx.fillText(`Height (Rise): ${overallRise.toFixed(2)} ${units}`, 0, 0);
    ctx.restore();

    ctx.setLineDash([5,4]); ctx.strokeStyle='#bbb'; ctx.fillStyle='#ddd';
    ets.forEach(pt=>{
      const Xp = x0 + s*pt.run; const Yp = y0 - s*pt.rise;
      drawArrow(ctx, x0, Yp, Xp, Yp);
      ctx.fillText(`B${pt.idx} Run: ${pt.run.toFixed(2)} ${units}`, x0 + (Xp - x0)/2 - 40, Yp - 6);
      drawArrow(ctx, Xp, y0, Xp, Yp);
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

    const name = document.getElementById('tubeName').value;
    const units = document.getElementById('units').value;
    const od = document.getElementById('od').value, wall = document.getElementById('wall').value;
    const total = document.getElementById('total').textContent;
    const weight = document.getElementById('weight').textContent;
    const notched = document.getElementById('notched').checked;
    const bOffset = document.getElementById('benderOffset').value;

    doc.setFontSize(16);
    doc.text(`${name} — Cut Sheet`, 0.5, 0.7);
    doc.setFontSize(10);
    doc.text(`OD×Wall: ${od}×${wall} ${units}`, 0.5, 1.0);
    doc.text(`Notched: ${notched ? 'Yes (−OD/3 from start ref)' : 'No'}`, 3.2, 1.0);
    doc.text(`Bender start offset: ${bOffset || '0'} ${units}`, 0.5, 1.2);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 3.2, 1.2);

    let y = 1.5;
    const headers = ['#','ST','Pointer','Angle°','CLR','Arc','ET (Rise, Run)','ΔRise/ΔRun','ΔST(manual)'];
    const colX = [0.35, 0.6, 1.3, 2.1, 2.6, 3.0, 3.8, 5.2, 6.6];
    doc.setFontSize(9); doc.setFont(undefined,'bold');
    headers.forEach((h,i)=> doc.text(h, colX[i], y));
    doc.setFont(undefined,'normal');
    y += 0.18;

    const toIn = (x)=> (units==='mm' ? x/25.4 : x);
    const toUI = (x)=> (units==='mm' ? x*25.4 : x);

    const startTail_ui = parseFloat(document.getElementById('startTail').value||'0');
    const od_ui = parseFloat(document.getElementById('od').value||'0');
    const notch_ui = notched ? od_ui/3.0 : 0;
    const startTail = Math.max(0, toIn(startTail_ui - notch_ui));

    let run=0, rise=0, heading=0; run += startTail;
    const benderOffset = parseFloat(bOffset||'0');

    const bends = getBends();

    for (let idx=0; idx<bends.length; idx++){
      const b = bends[idx];
      const a = b.angle*Math.PI/180;
      const R = toIn(b.clr);
      const arc = R*a;

      let stComputed = startTail + sumUpTo(bends, idx, units);
      let stMark = stComputed;
      if (b.stManual!==null){ stMark = toIn(b.stManual); }

      const run_et = run + R*Math.sin(heading + a) - R*Math.sin(heading);
      const rise_et = rise - R*Math.cos(heading + a) + R*Math.cos(heading);
      const heading_after = heading + a;

      const st_ui = toUI(stMark).toFixed(2);
      const ptr_ui = Math.max(0.0, toUI(stMark) - benderOffset).toFixed(2);
      const arc_ui = toUI(arc).toFixed(2);
      const et_ui = `(Rise ${toUI(rise_et).toFixed(2)}, Run ${toUI(run_et).toFixed(2)} ${units})`;
      const stDelta = (b.stManual===null) ? '–' : (toUI(stMark) - toUI(stComputed)).toFixed(2) + ' ' + units;

      doc.text(String(idx+1), colX[0], y);
      doc.text(st_ui + ' ' + units, colX[1], y);
      doc.text(ptr_ui + ' ' + units, colX[2], y);
      doc.text(b.angle.toFixed(2), colX[3], y);
      doc.text((b.clr).toFixed(2) + ' ' + units, colX[4], y);
      doc.text(arc_ui + ' ' + units, colX[5], y);
      doc.text(et_ui, colX[6], y);
      doc.text('see app', colX[7], y);
      doc.text(stDelta, colX[8], y);
      y += 0.18;

      const s = toIn(b.straight);
      run = run_et + s*Math.cos(heading_after);
      rise = rise_et + s*Math.sin(heading_after);
      heading = heading_after;
    }

    const sketch = document.getElementById('sketch');
    const imgData = sketch.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 0.5, 3.7, 7.5, 2.6);

    doc.setFontSize(11);
    doc.text(`Total Cut Length: ${document.getElementById('total').textContent}`, 0.5, 6.5);
    doc.text(`Estimated Weight: ${document.getElementById('weight').textContent}`, 4.5, 6.5);
    doc.text("All marks from cut end along tube centerline. Notch adjustment and bender offset applied to pointer marks.", 0.5, 6.7);

    doc.save((name||'Tube') + '_CutSheet.pdf');
  }

  function sumUpTo(bends, idx, units){
    const toIn = (x)=> (units==='mm' ? x/25.4 : x);
    let s = 0;
    for(let i=0;i<idx;i++){
      const b = bends[i];
      const R = toIn(b.clr), a = b.angle*Math.PI/180;
      s += R*a + toIn(b.straight);
    }
    return s;
  }

  document.getElementById('addBend').onclick = ()=> addBendRow();
  document.getElementById('example').onclick = ()=>{
    document.getElementById('tubeName').value = 'Driver A-Pillar';
    document.getElementById('startTail').value = '2';
    document.getElementById('endTail').value = '2';
    document.getElementById('units').value = 'in';
    document.getElementById('material').value = 'steel';
    document.getElementById('od').value = '1.75';
    document.getElementById('wall').value = '0.120';
    document.getElementById('notched').checked = True;
    document.getElementById('benderOffset').value = '4.25';
    bendsDiv.innerHTML = '';
    addBendRow(59, 5.5, 13.33, 0, 16, '');
    calc(); saveState();
  };
  ['units','material','od','wall','tubeName','startTail','endTail','notched','benderOffset'].forEach(id => document.getElementById(id).addEventListener('input', ()=>{ calc(); saveState(); }));
  document.addEventListener('input', (e)=>{ if (e.target && e.target.closest('.bendRow')) { calc(); saveState(); }});
  document.getElementById('exportPDF').onclick = exportPDF;

  if (bendsDiv.children.length===0) addBendRow();
  loadState();
  calc();

  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js');
  }
});
