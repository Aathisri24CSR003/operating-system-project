// DOM elements
const refInput = document.getElementById('refInput');
const frameInput = document.getElementById('frameInput');
const runBtn = document.getElementById('runSimBtn');
const resetDefBtn = document.getElementById('resetBtn');
const refContainer = document.getElementById('refListContainer');
const frameMatrixDiv = document.getElementById('frameMatrixView');
const logPanel = document.getElementById('logPanel');
const activeTitleSpan = document.getElementById('activeAlgoTitle');

// stats spans
const fifoFaultSpan = document.getElementById('fifoFaultVal');
const lruFaultSpan = document.getElementById('lruFaultVal');
const optFaultSpan = document.getElementById('optFaultVal');
const fifoHitSpan = document.getElementById('fifoHitVal');
const lruHitSpan = document.getElementById('lruHitVal');
const optHitSpan = document.getElementById('optHitVal');
const fifoWinner = document.getElementById('fifoWinnerBadge');
const lruWinner = document.getElementById('lruWinnerBadge');
const optWinner = document.getElementById('optWinnerBadge');

let currentFifoSteps = [], currentLruSteps = [], currentOptSteps = [];
let currentRefArray = [], currentFrameCount = 3;
let chartGlobal = null;

// ---------- ALGORITHMS ----------
function fifoSim(refs, limit) {
    let frames = [], queue = [], steps = [], faults = 0;
    for (let i = 0; i < refs.length; i++) {
        let page = refs[i];
        let isFault = false, replaced = null, detail = "";
        if (frames.includes(page)) {
            detail = `HIT: Page ${page} already in memory.`;
        } else {
            isFault = true;
            faults++;
            if (frames.length < limit) {
                frames.push(page);
                queue.push(page);
                detail = `FAULT → Load ${page} into free frame.`;
            } else {
                let victim = queue.shift();
                let idx = frames.indexOf(victim);
                if (idx !== -1) {
                    replaced = victim;
                    frames[idx] = page;
                    queue.push(page);
                    detail = `FAULT → Replace ${victim} with ${page} (FIFO)`;
                } else {
                    frames[0] = page;
                    queue.shift();
                    queue.push(page);
                    replaced = victim;
                    detail = `FAULT → Replace with ${page}`;
                }
            }
        }
        steps.push({ page, framesSnapshot: [...frames], isFault, replacedPage: replaced, detail, cumFaults: faults });
    }
    let hitRatio = ((refs.length - faults) / refs.length * 100).toFixed(2);
    return { steps, faults, hitRatio };
}

function lruSim(refs, limit) {
    let frames = [], recency = [], steps = [], faults = 0;
    for (let i = 0; i < refs.length; i++) {
        let page = refs[i];
        let isFault = false, replaced = null, detail = "";
        let hitIdx = frames.indexOf(page);
        if (hitIdx !== -1) {
            let pos = recency.indexOf(page);
            if (pos !== -1) recency.splice(pos, 1);
            recency.push(page);
            detail = `HIT: ${page} → MRU updated.`;
        } else {
            isFault = true;
            faults++;
            if (frames.length < limit) {
                frames.push(page);
                recency.push(page);
                detail = `FAULT → Load ${page} into free slot.`;
            } else {
                let lruPage = recency.shift();
                let idx = frames.indexOf(lruPage);
                if (idx !== -1) {
                    replaced = lruPage;
                    frames[idx] = page;
                    recency.push(page);
                    detail = `FAULT → Evict LRU ${lruPage} → load ${page}.`;
                } else {
                    replaced = frames[0];
                    frames[0] = page;
                    recency.shift();
                    recency.push(page);
                    detail = `FAULT → Replace with ${page}.`;
                }
            }
        }
        steps.push({ page, framesSnapshot: [...frames], isFault, replacedPage: replaced, detail, cumFaults: faults });
    }
    let hitRatio = ((refs.length - faults) / refs.length * 100).toFixed(2);
    return { steps, faults, hitRatio };
}

function optimalSim(refs, limit) {
    let frames = [], steps = [], faults = 0;
    for (let i = 0; i < refs.length; i++) {
        let page = refs[i];
        let isFault = false, replaced = null, detail = "";
        if (frames.includes(page)) {
            detail = `HIT: Page ${page} already resident.`;
        } else {
            isFault = true;
            faults++;
            if (frames.length < limit) {
                frames.push(page);
                detail = `FAULT → Load ${page} (free frame).`;
            } else {
                let farthestIdx = -1, victim = null;
                for (let f of frames) {
                    let nextUse = Infinity;
                    for (let j = i + 1; j < refs.length; j++) {
                        if (refs[j] === f) {
                            nextUse = j;
                            break;
                        }
                    }
                    if (nextUse > farthestIdx) {
                        farthestIdx = nextUse;
                        victim = f;
                    }
                }
                let idx = frames.indexOf(victim);
                replaced = victim;
                frames[idx] = page;
                let futureMsg = farthestIdx === Infinity ? "NEVER" : `at step ${farthestIdx + 1}`;
                detail = `FAULT → OPTIMAL: evict ${victim} (used ${futureMsg}) → load ${page}.`;
            }
        }
        steps.push({ page, framesSnapshot: [...frames], isFault, replacedPage: replaced, detail, cumFaults: faults });
    }
    let hitRatio = ((refs.length - faults) / refs.length * 100).toFixed(2);
    return { steps, faults, hitRatio };
}

function parseRefString(str) {
    let parts = str.split(/[\s,]+/);
    let nums = [];
    for (let p of parts) {
        let n = parseInt(p);
        if (!isNaN(n)) nums.push(n);
    }
    return nums;
}

// graph rendering
function renderGraph(fifoSteps, lruSteps, optSteps) {
    const ctx = document.getElementById('cumulativeGraph').getContext('2d');
    if (chartGlobal) chartGlobal.destroy();
    let labels = fifoSteps.map((_, idx) => `#${idx + 1}`);
    chartGlobal = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'FIFO Faults', data: fifoSteps.map(s => s.cumFaults), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.05)', borderWidth: 3, tension: 0.2, fill: false, pointRadius: 3, pointBackgroundColor: '#3b82f6' },
                { label: 'LRU Faults', data: lruSteps.map(s => s.cumFaults), borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.05)', borderWidth: 3, tension: 0.2, fill: false, pointRadius: 3 },
                { label: 'OPTIMAL Faults', data: optSteps.map(s => s.cumFaults), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.05)', borderWidth: 3, tension: 0.2, fill: false, pointRadius: 3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { labels: { color: '#e2e8f0', font: { size: 11 } } },
                tooltip: { mode: 'index' }
            },
            scales: {
                x: { ticks: { color: '#cbd5e6', maxRotation: 45 }, grid: { color: '#2d3855' } },
                y: { ticks: { color: '#cbd5e6', stepSize: 1 }, grid: { color: '#2d3855' }, title: { display: true, text: 'Cumulative Faults', color: '#facc15' } }
            }
        }
    });
}

function updateCardsAndWinners(fifoRes, lruRes, optRes) {
    fifoFaultSpan.innerText = fifoRes.faults;
    lruFaultSpan.innerText = lruRes.faults;
    optFaultSpan.innerText = optRes.faults;
    fifoHitSpan.innerText = `Hit Ratio: ${fifoRes.hitRatio}%`;
    lruHitSpan.innerText = `Hit Ratio: ${lruRes.hitRatio}%`;
    optHitSpan.innerText = `Hit Ratio: ${optRes.hitRatio}%`;
    let minFaults = Math.min(fifoRes.faults, lruRes.faults, optRes.faults);
    fifoWinner.style.display = fifoRes.faults === minFaults ? "inline-block" : "none";
    lruWinner.style.display = lruRes.faults === minFaults ? "inline-block" : "none";
    optWinner.style.display = optRes.faults === minFaults ? "inline-block" : "none";
}

function renderDetailedTimeline(algoKey, steps, frameCount, refArray) {
    if (!steps || steps.length === 0) {
        frameMatrixDiv.innerHTML = "<div style='padding:1rem'>No simulation steps</div>";
        return;
    }
    let html = `<div style="overflow-x:auto;"><div style="display:flex; min-width:max-content; background:#0e182c; border-radius:12px 12px 0 0;">`;
    html += `<div style="flex:0 0 85px; text-align:center; padding:8px 0; font-weight:bold;">Step</div>`;
    for (let i = 0; i < steps.length; i++) {
        let s = steps[i];
        let statusBadge = s.isFault ? `<span style="background:#dc2626; padding:2px 8px; border-radius:30px; font-size:0.6rem;">⚠️ FAULT</span>` : `<span style="background:#10b981; padding:2px 8px; border-radius:30px; font-size:0.6rem;">✓ HIT</span>`;
        html += `<div style="flex:0 0 85px; text-align:center; padding:6px 2px;">
                    <div style="font-size:0.7rem;">#${i + 1}</div>
                    <div style="font-size:1.3rem; font-weight:800; color:#facc15;">${s.page}</div>
                    ${statusBadge}
                </div>`;
    }
    html += `</div>`;
    for (let row = 0; row < frameCount; row++) {
        html += `<div style="display:flex; min-width:max-content; margin-top:4px;">
                    <div style="flex:0 0 85px; background:#0a1125; display:flex; align-items:center; justify-content:center; font-weight:bold;">Frame ${row + 1}</div>`;
        for (let col = 0; col < steps.length; col++) {
            let snap = steps[col].framesSnapshot;
            let val = (row < snap.length) ? snap[row] : "—";
            let extra = "";
            let stepObj = steps[col];
            if (stepObj.isFault && val === stepObj.page && snap.includes(stepObj.page) && row === snap.indexOf(stepObj.page)) {
                extra = stepObj.replacedPage !== null ? "fault-replace-cell" : "fault-new-cell";
            }
            html += `<div class="frame-cell-data ${extra}">${val === "—" ? "∅" : val}</div>`;
        }
        html += `</div>`;
    }
    html += `<div style="font-size:0.7rem; margin-top:12px; color:#aac8ff;">🟢 Teal = New Load &nbsp; 🟠 Orange = Replacement Eviction</div></div>`;
    frameMatrixDiv.innerHTML = html;

    let logHtml = "";
    for (let s of steps) {
        logHtml += `<div class="log-line"><strong>[Step ${s.stepIdx + 1}]</strong> Page ${s.page} → ${s.isFault ? '❌ FAULT' : '✅ HIT'} → ${s.detail} &nbsp;| frames: [${s.framesSnapshot.join(", ")}]</div>`;
    }
    logPanel.innerHTML = logHtml || `<div class="log-line">Logs ready</div>`;
}

function runAllSimulations() {
    let rawRef = refInput.value.trim();
    if (!rawRef) {
        alert("Enter reference string");
        return;
    }
    let refArray = parseRefString(rawRef);
    if (refArray.length === 0) {
        alert("Invalid numbers (use commas/spaces)");
        return;
    }
    let frameLimit = parseInt(frameInput.value);
    if (isNaN(frameLimit)) frameLimit = 3;
    frameLimit = Math.min(8, Math.max(3, frameLimit));
    frameInput.value = frameLimit;
    currentRefArray = refArray;
    currentFrameCount = frameLimit;

    let fifoRes = fifoSim(refArray, frameLimit);
    let lruRes = lruSim(refArray, frameLimit);
    let optRes = optimalSim(refArray, frameLimit);
    fifoRes.steps = fifoRes.steps.map((s, idx) => ({ ...s, stepIdx: idx }));
    lruRes.steps = lruRes.steps.map((s, idx) => ({ ...s, stepIdx: idx }));
    optRes.steps = optRes.steps.map((s, idx) => ({ ...s, stepIdx: idx }));
    currentFifoSteps = fifoRes.steps;
    currentLruSteps = lruRes.steps;
    currentOptSteps = optRes.steps;

    updateCardsAndWinners(
        { faults: fifoRes.faults, hitRatio: fifoRes.hitRatio },
        { faults: lruRes.faults, hitRatio: lruRes.hitRatio },
        { faults: optRes.faults, hitRatio: optRes.hitRatio }
    );
    renderGraph(fifoRes.steps, lruRes.steps, optRes.steps);

    // render reference string
    refContainer.innerHTML = refArray.map(p => `<div class="ref-badge">${p}</div>`).join('');

    // default view FIFO
    activeTitleSpan.innerText = "FIFO";
    renderDetailedTimeline('fifo', currentFifoSteps, frameLimit, refArray);
}

function switchToAlgorithm(algo) {
    if (algo === 'fifo' && currentFifoSteps.length) {
        activeTitleSpan.innerText = "FIFO";
        renderDetailedTimeline('fifo', currentFifoSteps, currentFrameCount, currentRefArray);
    } else if (algo === 'lru' && currentLruSteps.length) {
        activeTitleSpan.innerText = "LRU";
        renderDetailedTimeline('lru', currentLruSteps, currentFrameCount, currentRefArray);
    } else if (algo === 'optimal' && currentOptSteps.length) {
        activeTitleSpan.innerText = "OPTIMAL";
        renderDetailedTimeline('optimal', currentOptSteps, currentFrameCount, currentRefArray);
    }
}

function resetToPreset() {
    refInput.value = "1,2,3,2,4,1,3,2,4,1";
    frameInput.value = "3";
    runAllSimulations();
}

// event listeners
runBtn.addEventListener('click', runAllSimulations);
resetDefBtn.addEventListener('click', resetToPreset);
document.getElementById('cardFifo').addEventListener('click', () => switchToAlgorithm('fifo'));
document.getElementById('cardLru').addEventListener('click', () => switchToAlgorithm('lru'));
document.getElementById('cardOptimal').addEventListener('click', () => switchToAlgorithm('optimal'));

// initial load
resetToPreset();