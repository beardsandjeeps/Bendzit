(() => {
  const $ = (id) => document.getElementById(id);
  const bendsDiv = $('bends');
  let bendCount = 0;

  function unitFactor(){ return $('units').value === 'mm' ? 25.4 : 1; } // UI -> inches
  function fmtLen(inches){
    const u = $('units').value;
    const val = u === 'mm' ? inches*25.4 : inches;
    return val.toFixed(2) + ' ' + u;
  }
  function densityLbin3(){
    return $('material').value === 'aluminum' ? 0.0975 : 0.283; // lb per in^3
  }

  function addBend(angle=59, clr=6.0, straight=10){
    bendCount++;
    const row = document.createElement('div');
    row.className = 'bendRow';
    row.dataset.idx = bendCount;
    row.innerHTML = `
      <div>
        <label>Bend Angle (°)</label>
        <input type="number" class="angle" step="any" value="${angle}">
      </div>
      <div>
        <label>CLR</label>
        <input type="number" class="clr" step="any" value="${clr}">
      </div>
      <div>
        <label>Straight after bend</label>
        <input type="number" class="straight" step="any" value="${straight}">
      </div>
      <div>
        <label>Arc length</label>
        <input type="text" class="arcOut" value="-" disabled>
      </div>
      <div>
        <label>Mark (end of bend)</label>
        <input type="text" class="markOut" value="-" disabled>
      </div>
      <div class="x" title="Remove">✕</div>
    `;
    bendsDiv.appendChild(row);
    row.querySelector('.x').addEventListener('click', ()=>{ row.remove(); calc(); });
    row.querySelectorAll('input').forEach(el=> el.addEventListener('input', calc));
    calc();
  }

  function getRows(){
    return Array.from(bendsDiv.querySelectorAll('.bendRow')).map(r => ({
      el: r,
      angle: parseFloat(r.querySelector('.angle').value)||0,
      clr: parseFloat(r.querySelector('.clr').value)||0,
      straight: parseFloat(r.querySelector('.straight').value)||0
    }));
  }

  function calc(){
    const k = unitFactor();
    const tail1 = (parseFloat($('tail1').value)||0)/k;
    const tail2 = (parseFloat($('tail2').value)||0)/k;
    const rows = getRows();

    // Sum straights (convert to inches)
    let straightSum = tail1 + tail2;
    rows.forEach(r => straightSum += (r.straight||0)/k);

    // Arc totals and per-row
    let arcTotal = 0;
    let markPos = tail1; // running length for marks along CL
    rows.forEach(r => {
      const aRad = (r.angle||0) * Math.PI/180;
      const clrIn = (r.clr||0)/k;
      const arc = aRad * clrIn;
      arcTotal += arc;
      markPos += arc; // end of bend
      // update outputs in UI units
      r.el.querySelector('.arcOut').value = fmtLen(arc);
      r.el.querySelector('.markOut').value = fmtLen(markPos);
      // add straight after bend to running mark
      markPos += (r.straight||0)/k;
    });

    const total = straightSum + arcTotal;

    // Weight estimate
    const od = (parseFloat($('od').value)||0)/k;
    const wall = (parseFloat($('wall').value)||0)/k;
    const id = Math.max(0, od - 2*wall);
    const area = Math.PI/4 * (od*od - id*id); // in^2
    const density = densityLbin3(); // lb/in^3
    const weight = total * area * density; // lb

    $('straight').textContent = fmtLen(straightSum);
    $('arcTotal').textContent = fmtLen(arcTotal);
    $('total').textContent = fmtLen(total);
    $('weight').textContent = weight.toFixed(2) + ' lb';
    $('marks').textContent = 'Bend mark positions are measured from the start cut end along the tube centerline. Each row shows the end-of-bend mark; add the listed straight to reach the next bend.';
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

  // Bootstrap with one row
  addBend(59, 6.0, 10);
})();