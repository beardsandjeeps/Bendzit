(() => {
  const $ = (id) => document.getElementById(id);
  const bendsDiv = $('bends');
  let bendCount = 0;

  const unitFactor = () => $('units').value === 'mm' ? 25.4 : 1; // UI->in
  const fmtLen = (inches) => {
    const u = $('units').value;
    const val = u === 'mm' ? inches*25.4 : inches;
    return val.toFixed(2) + ' ' + u;
  };
  const densityLbin3 = () => $('material').value === 'aluminum' ? 0.0975 : 0.283;
  const asNum = (v) => { v = parseFloat(v); return isNaN(v)?0:v; };

  function addBend(angle=59, clr=6.0, straight=10){
    bendCount++;
    const row = document.createElement('div');
    row.className = 'bendRow';
    row.dataset.idx = bendCount;
    row.innerHTML = `
      <div><label>Bend #${bendCount} Angle (°)</label><input type="number" class="angle" step="any" value="${angle}"></div>
      <div><label>CLR</label><input type="number" class="clr" step="any" value="${clr}"></div>
      <div><label>Straight after</label><input type="number" class="straight" step="any" value="${straight}"></div>
      <div><label>Start Tangent</label><input type="text" class="stOut" value="-" disabled></div>
      <div><label>End Tangent</label><input type="text" class="etOut" value="-" disabled></div>
      <div><label>Arc length</label><input type="text" class="arcOut" value="-" disabled></div>
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
      straight: asNum(r.querySelector('.straight').value)
    }));
  }

  function buildTable(rows, tangents){
    let html = `<table><thead><tr>
      <th>Bend</th><th>Angle (°)</th><th>CLR</th>
      <th>Start Tangent (ST)</th><th>End Tangent (ET)</th>
      <th>Arc Length</th><th>Straight After</th></tr></thead><tbody>`;
    rows.forEach((r,i)=>{
      const t = tangents[i];
      html += `<tr>
        <td>#${i+1}</td>
        <td>${r.angle.toFixed(2)}</td>
        <td>${fmtLen(r.clr / unitFactor())}</td>
        <td>${fmtLen(t.st)}</td>
        <td>${fmtLen(t.et)}</td>
        <td>${fmtLen(t.arc)}</td>
        <td>${fmtLen(r.straight / unitFactor())}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    $('tableWrap').innerHTML = html;
  }

  function drawTimeline(total, tangents){
    const c = $('timeline');
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    const pad = 30, y = c.height/2;
    const scale = (c.width - pad*2) / Math.max(total, 1e-6);
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + total*scale, y); ctx.stroke();
    function tick(x,label,color){
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x, y-18); ctx.lineTo(x, y+18); ctx.stroke();
      ctx.font = '12px system-ui'; ctx.textAlign='center'; ctx.fillText(label, x, y-22);
    }
    tangents.forEach((t,i)=>{
      tick(pad + t.st*scale, `B${i+1} ST`, '#7cf');
      tick(pad + t.et*scale, `B${i+1} ET`, '#fa7');
    });
    ctx.fillStyle = '#aaa'; ctx.font = '12px system-ui'; ctx.textAlign='left';
    ctx.fillText('0', pad-8, y+32);
    ctx.textAlign='right'; ctx.fillText(total.toFixed(2), pad + total*scale + 8, y+32);
  }

  function calc(){
    const k = unitFactor();
    const rows = getRows();
    const tail1 = asNum($('tail1').value)/k;
    const tail2 = asNum($('tail2').value)/k;

    let pos = tail1; // where first bend starts (ST1)
    let straightSum = tail1 + tail2;
    let arcTotal = 0;
    const tangents = [];

    rows.forEach(r => {
      const a = r.angle * Math.PI/180;
      const clrIn = r.clr / k;
      const arc = a * clrIn;   // centerline arc length
      const st = pos;
      const et = st + arc;
      tangents.push({st, et, arc});
      r.el.querySelector('.stOut').value = fmtLen(st);
      r.el.querySelector('.etOut').value = fmtLen(et);
      r.el.querySelector('.arcOut').value = fmtLen(arc);
      pos = et + (r.straight||0)/k;
      straightSum += (r.straight||0)/k;
      arcTotal += arc;
    });

    const total = straightSum + arcTotal;

    // Weight
    const od = asNum($('od').value)/k;
    const wall = asNum($('wall').value)/k;
    const id = Math.max(0, od - 2*wall);
    const area = Math.PI/4 * (od*od - id*id);
    const weight = total * area * densityLbin3();

    $('straight').textContent = fmtLen(straightSum);
    $('arcTotal').textContent = fmtLen(arcTotal);
    $('total').textContent = fmtLen(total);
    $('weight').textContent = weight.toFixed(2) + ' lb';

    buildTable(rows, tangents);
    drawTimeline(total, tangents);
  }

  // Listeners
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
    addBend(59, 6.0, 20);
    addBend(59, 6.0, 15);
    calc();
  });

  // Bootstrap one bend
  addBend(59, 6.0, 10);
})();