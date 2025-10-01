(() => {
  const $ = (id) => document.getElementById(id);
  const bendsDiv = $('bends');
  let bendCount = 0;

  const unitFactor = () => $('units').value === 'mm' ? 25.4 : 1; // UI->inches
  const fmtLen = (inches) => {
    const u = $('units').value;
    const val = u === 'mm' ? inches*25.4 : inches;
    return val.toFixed(2) + ' ' + u;
  };
  const densityLbin3 = () => $('material').value === 'aluminum' ? 0.0975 : 0.283;
  const asNum = (v) => { v = parseFloat(v); return isNaN(v)?0:v; };

  function addBend(angle=59, clr=6.0, straight=10, targetX='', targetY='', targetMode=false){
    bendCount++;
    const row = document.createElement('div');
    row.className = 'bendRow';
    row.dataset.idx = bendCount;
    row.innerHTML = `
      <div><label>#${bendCount} Angle (°)</label><input type="number" class="angle" step="any" value="${angle}"></div>
      <div><label>CLR</label><input type="number" class="clr" step="any" value="${clr}"></div>
      <div><label>Mode</label>
        <div class="mode">
          <label><input type="checkbox" class="targetMode" ${targetMode?'checked':''}> Target</label>
        </div>
      </div>
      <div><label>Target Run X</label><input type="number" class="tgtX" step="any" value="${targetX}"></div>
      <div><label>Target Rise Y</label><input type="number" class="tgtY" step="any" value="${targetY}"></div>
      <div><label>Straight after</label><input type="number" class="straight" step="any" value="${straight}"></div>
      <div><label>ST mark</label><input type="text" class="stOut" value="-" disabled></div>
      <div><label>ET mark</label><input type="text" class="etOut" value="-" disabled></div>
      <div><label>Arc</label><input type="text" class="arcOut" value="-" disabled></div>
      <div class="x" title="Remove">✕</div>`;
    bendsDiv.appendChild(row);
    row.querySelector('.x').addEventListener('click', ()=>{ row.remove(); calc(); });
    row.querySelectorAll('input').forEach(el=> el.addEventListener('input', calc));
    calc();
  }

  function getRows(){
    return Array.from(bendsDiv.querySelectorAll('.bendRow')).map(r => ({
      el: r,
      angle: asNum(r.querySelector('.angle').value),
      clr: asNum(r.querySelector('.clr').value),
      straight: asNum(r.querySelector('.straight').value),
      targetMode: r.querySelector('.targetMode').checked,
      tgtX: r.querySelector('.tgtX').value === '' ? null : asNum(r.querySelector('.tgtX').value),
      tgtY: r.querySelector('.tgtY').value === '' ? null : asNum(r.querySelector('.tgtY').value),
    }));
  }

  function buildTable(rows, tangents, coords, suggestions){
    let html = `<table><thead><tr>
      <th>Bend</th><th>Mode</th><th>Angle (°)</th><th>CLR</th>
      <th>ST (mark)</th><th>ET (mark)</th>
      <th>Arc</th><th>X_ET</th><th>Y_ET</th><th>Target</th><th>Suggest Straight</th><th>Error</th>
    </tr></thead><tbody>`;
    rows.forEach((r,i)=>{
      const t = tangents[i];
      const c = coords[i];
      const s = suggestions[i];
      html += `<tr>
        <td>#${i+1}</td>
        <td>${r.targetMode?'Target':'Manual'}</td>
        <td>${r.angle.toFixed(2)}</td>
        <td>${fmtLen(r.clr / unitFactor())}</td>
        <td>${fmtLen(t.st)}</td>
        <td>${fmtLen(t.et)}</td>
        <td>${fmtLen(t.arc)}</td>
        <td>${(c.x).toFixed(2)}</td>
        <td>${(c.y).toFixed(2)}</td>
        <td>${r.targetMode ? `(${r.tgtX!==null?r.tgtX.toFixed(2):'–'}, ${r.tgtY!==null?r.tgtY.toFixed(2):'–'})` : '–'}</td>
        <td>${r.targetMode ? (s.suggest !== null ? fmtLen(s.suggest) : 'n/a') : '–'}</td>
        <td>${r.targetMode ? (s.err!==null? `${s.err.x.toFixed(2)}, ${s.err.y.toFixed(2)}` : '0, 0') : '–'}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    $('tableWrap').innerHTML = html;
  }

  function drawTimeline(totalLen, tangents, coords){
    const c = $('timeline');
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    const pad = 40, y0 = c.height - 30;

    // Axes
    ctx.strokeStyle='#666'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(c.width-10, y0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(pad, 10); ctx.stroke();
    ctx.fillStyle='#aaa'; ctx.font='12px system-ui';
    ctx.fillText('X (run)', c.width-60, y0-6);
    ctx.fillText('Y (rise)', pad+6, 20);

    // Determine scale
    let maxX=0, maxY=0;
    coords.forEach(p => { maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
    maxX = Math.max(maxX, 1);
    maxY = Math.max(maxY, 1);
    const sx = (c.width - pad - 20) / maxX;
    const sy = (y0 - 10) / maxY;

    // Plot ETs
    ctx.fillStyle='#7cf';
    coords.forEach((p,i)=>{
      const x = pad + p.x * sx;
      const y = y0 - p.y * sy;
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      ctx.fillText(`B${i+1} ET`, x+6, y-6);
    });
  }

  function calc(){
    const k = unitFactor();
    const rows = getRows();
    const tail1 = asNum($('tail1').value)/k;
    const tail2 = asNum($('tail2').value)/k;

    // Linear marks
    let markPos = tail1;
    let straightSum = tail1 + tail2;
    let arcTotal = 0;
    const tangents = [];
    const coords = [];
    const suggestions = [];

    // XY path
    let X = 0, Y = 0;
    let heading = 0; // radians; 0 = +X

    rows.forEach((r, i) => {
      const a = r.angle * Math.PI/180;
      const clrIn = r.clr / k;
      const arc = a * clrIn;

      // Tangent marks
      const st = markPos;
      const et = st + arc;

      // Arc XY from ST to ET (circular arc, turning by +a)
      const dX_arc = clrIn * Math.sin(heading + a) - clrIn * Math.sin(heading);
      const dY_arc = -clrIn * Math.cos(heading + a) + clrIn * Math.cos(heading);
      const heading_after = heading + a;

      // Coordinates at ET
      const X_et = X + dX_arc;
      const Y_et = Y + dY_arc;

      // Default: use user's straight-after
      let straightAfter = r.straight / k;

      // Target mode: suggest straight to reach target (optional X/Y)
      if (r.targetMode && (r.tgtX !== null || r.tgtY !== null)){
        const tgtX = (r.tgtX !== null) ? r.tgtX : X_et;
        const tgtY = (r.tgtY !== null) ? r.tgtY : Y_et;
        const ex = tgtX - X_et;
        const ey = tgtY - Y_et;
        const s_need = ex * Math.cos(heading_after) + ey * Math.sin(heading_after);
        const s_suggest = s_need > 0 ? s_need : 0;
        suggestions.push({suggest: s_suggest, err: {x: ex - s_suggest*Math.cos(heading_after),
                                                    y: ey - s_suggest*Math.sin(heading_after)}});
      } else {
        suggestions.push({suggest: null, err: null});
      }

      // Apply manual straight-after to path & marks
      const dX_str = straightAfter * Math.cos(heading_after);
      const dY_str = straightAfter * Math.sin(heading_after);
      const X_next = X_et + dX_str;
      const Y_next = Y_et + dY_str;

      // Save
      tangents.push({st, et, arc});
      coords.push({x: X_et, y: Y_et});

      // Advance
      markPos = et + straightAfter;
      straightSum += straightAfter;
      arcTotal += arc;
      X = X_next; Y = Y_next; heading = heading_after;
    });

    const total = straightSum + arcTotal;

    // Weight
    const od = asNum($('od').value)/k;
    const wall = asNum($('wall').value)/k;
    const id = Math.max(0, od - 2*wall);
    const area = Math.PI/4 * (od*od - id*id);
    const weight = total * area * densityLbin3();

    // Per-row UI
    rows.forEach((r,i)=>{
      const t = tangents[i];
      r.el.querySelector('.stOut').value = fmtLen(t.st);
      r.el.querySelector('.etOut').value = fmtLen(t.et);
      r.el.querySelector('.arcOut').value = fmtLen(t.arc);
    });

    $('straight').textContent = fmtLen(straightSum);
    $('arcTotal').textContent = fmtLen(arcTotal);
    $('total').textContent = fmtLen(total);
    $('weight').textContent = weight.toFixed(2) + ' lb';

    buildTable(rows, tangents, coords, suggestions);
    drawTimeline(total, tangents, coords);
  }

  // UI hooks
  ['units','material','od','wall','tail1','tail2'].forEach(id => $(id).addEventListener('input', calc));
  $('calc').addEventListener('click', calc);
  $('addBend').addEventListener('click', () => addBend());

  $('example').addEventListener('click', () => {
    $('units').value = 'in';
    $('material').value = 'steel';
    $('od').value = '1.75';
    $('wall').value = '0.120';
    $('tail1').value = '2';
    $('tail2').value = '2';
    bendsDiv.innerHTML='';
    // Example: Bend 1 target Y=16; Bend 2 target X=20,Y=24 (suggest straight shown)
    addBend(59, 5.5, 0, '', 16, true);
    addBend(59, 5.5, 12, 20, 24, true);
    calc();
  });

  // Bootstrap
  addBend(59, 5.5, 10, '', '', false);
})();