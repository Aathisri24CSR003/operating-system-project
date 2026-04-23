// DOM elements
const refInput = document.getElementById('refInput');
const frameInput = document.getElementById('frameInput');
const simulateBtn = document.getElementById('simulateBtn');
const resetBtn = document.getElementById('resetBtn');
const refSequenceContainer = document.getElementById('refSequenceContainer');
const frameMatrixDiv = document.getElementById('frameMatrix');
const logArea = document.getElementById('logArea');
const activeAlgoLabel = document.getElementById('activeAlgoLabel');

// Stats spans
const fifoFaultSpan = document.getElementById('fifoFaults');
const lruFaultSpan = document.getElementById('lruFaults');
const optFaultSpan = document.getElementById('optFaults');
const fifoHitSpan = document.getElementById('fifoHit');
const lruHitSpan = document.getElementById('lruHit');
const optHitSpan = document.getElementById('optHit');
const fifoWinnerDiv = document.getElementById('fifoWinner');
const lruWinnerDiv = document.getElementById('lruWinner');
const optWinnerDiv = document.getElementById('optWinner');

let comparisonChart = null;
let currentFIFOSteps = [], currentLRUSteps = [], currentOptSteps = [];
let currentRefArray = [], currentFrameCount = 3;
let activeView = 'fifo';

// ----- Helper Functions -----
function parseRefString(raw) {
    let tokens = raw.split(/[\s,]+/);
    let nums = [];
    for(let t of tokens) { 
        let n = parseInt(t); 
        if(!isNaN(n)) nums.push(n); 
    }
    return nums;
}

// ----- Algorithm Implementations -----
function simulateFIFO(refs, limit) {
    let frames = [], queue = [], steps = [], faults = 0;
    for(let i = 0; i < refs.length; i++) {
        let page = refs[i];
        let isFault = false, replaced = null, detail = "";
        if(frames.includes(page)) { 
            detail = `HIT: Page ${page} in memory.`; 
        } else {
            isFault = true; 
            faults++;
            if(frames.length < limit) { 
                frames.push(page); 
                queue.push(page); 
                detail = `FAULT → Load ${page} into free frame.`; 
            } else {
                let victim = queue.shift();
                let idx = frames.indexOf(victim);
                if(idx !== -1) { 
                    replaced = victim; 
                    frames[idx] = page; 
                    queue.push(page); 
                    detail = `FAULT → Replace ${victim} with ${page} (FIFO).`; 
                } else { 
                    frames[0] = page; 
                    queue.shift(); 
                    queue.push(page); 
                    replaced = victim; 
                    detail = `FAULT → Replace with ${page}.`; 
                }
            }
        }
        steps.push({ 
            page, 
            framesSnapshot: [...frames], 
            isFault, 
            replacedPage: replaced, 
            detail, 
            cumulativeFaults: faults 
        });
    }
    return { steps, faults, hitRatio: ((refs.length - faults)/refs.length * 100).toFixed(2) };
}

function simulateLRU(refs, limit) {
    let frames = [], recency = [], steps = [], faults = 0;
    for(let i = 0; i < refs.length; i++) {
        let page = refs[i];
        let isFault = false, replaced = null, detail = "";
        let hitIdx = frames.indexOf(page);
        if(hitIdx !== -1) {
            let pos = recency.indexOf(page); 
            if(pos !== -1) recency.splice(pos,1);
            recency.push(page); 
            detail = `HIT: ${page} → MRU updated.`;
        } else {
            isFault = true; 
            faults++;
            if(frames.length < limit) { 
                frames.push(page); 
                recency.push(page); 
                detail = `FAULT → Load ${page} (free slot).`; 
            } else {
                let lruPage = recency.shift();
                let idx = frames.indexOf(lruPage);
                if(idx !== -1) { 
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
        steps.push({ 
            page, 
            framesSnapshot: [...frames], 
            isFault, 
            replacedPage: replaced, 
            detail, 
            cumulativeFaults: faults 
        });
    }
    return { steps, faults, hitRatio: ((refs.length - faults)/refs.length * 100).toFixed(2) };
}

function simulateOptimal(refs, limit) {
    let frames = [], steps = [], faults = 0;
    for(let i = 0; i < refs.length; i++) {
        let page = refs[i];
        let isFault = false, replaced = null, detail = "";
        if(frames.includes(page)) { 
            detail = `HIT: ${page} already resident.`; 
        } else {
            isFault = true; 
            faults++;
            if(frames.length < limit) { 
                frames.push(page); 
                detail = `FAULT → Load ${page} into free frame.`; 
            } else {
                let farthest = -1, victim = null;
                for(let f of frames) {
                    let nextUse = Infinity;
                    for(let j = i+1; j < refs.length; j++) { 
                        if(refs[j] === f) { 
                            nextUse = j; 
                            break; 
                        } 
                    }
                    if(nextUse > farthest) { 
                        farthest = nextUse; 
                        victim = f; 
                    }
                }
                let idx = frames.indexOf(victim);
                replaced = victim;
                frames[idx] = page;
                let futureDesc = farthest === Infinity ? "NEVER" : `at ${farthest}`;
                detail = `FAULT → OPTIMAL: evict ${victim} (used ${futureDesc}) → load ${page}.`;
            }
        }
        steps.push({ 
            page, 
            framesSnapshot: [...frames], 
            isFault, 
            replacedPage: replaced, 
            detail, 
            cumulativeFaults: faults 
        });
    }
    return { steps, faults, hitRatio: ((refs.length - faults)/refs.length * 100).toFixed(2) };
}

// ----- Chart Rendering -----
function renderComparisonChart(fifoSteps, lruSteps, optSteps) {
    const ctx = document.getElementById('comparisonGraph').getContext('2d');
    if(comparisonChart) comparisonChart.destroy();
    let labels = fifoSteps.map((_, idx) => `#${idx+1}`);
    comparisonChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { 
                    label: 'FIFO Faults', 
                    data: fifoSteps.map(s => s.cumulativeFaults), 
                    borderColor: '#3b82f6', 
                    backgroundColor: 'rgba(59,130,246,0.1)', 
                    borderWidth: 2.5, 
                    tension: 0.2, 
                    fill: false, 
                    pointRadius: 2 
                },
                { 
                    label: 'LRU Faults', 
                    data: lruSteps.map(s => s.cumulativeFaults), 
                    borderColor: '#a78bfa', 
                    backgroundColor: 'rgba(167,139,250,0.1)', 
                    borderWidth: 2.5, 
                    tension: 0.2, 
                    fill: false, 
                    pointRadius: 2 
                },
                { 
                    label: 'OPTIMAL Faults', 
                    data: optSteps.map(s => s.cumulativeFaults), 
                    borderColor: '#34d399', 
                    backgroundColor: 'rgba(52,211,153,0.1)', 
                    borderWidth: 2.5, 
                    tension: 0.2, 
                    fill: false, 
                    pointRadius: 2 
                }
            ]
        },
        options: {
            responsive: true, 
            maintainAspectRatio: true,
            plugins: { 
                legend: { labels: { color: '#cbd5e6', font: { size: 10 } } }, 
                tooltip: { mode: 'index' } 
            },
            scales: { 
                x: { 
                    ticks: { color: '#94a3b8', maxRotation: 45, autoSkip: true }, 
                    grid: { color: '#1e2a3e' } 
                }, 
                y: { 
                    ticks: { color: '#94a3b8', stepSize: 1 }, 
                    grid: { color: '#1e2a3e' }, 
                    title: { display: true, text: 'Fault Count', color: '#a5b9e0' } 
                } 
            }
        }
    });
}

// ----- UI Update Functions -----
function updateComparisonUI(fifoRes, lruRes, optRes) {
    fifoFaultSpan.innerText = fifoRes.faults; 
    fifoHitSpan.innerText = fifoRes.hitRatio + "%";
    lruFaultSpan.innerText = lruRes.faults; 
    lruHitSpan.innerText = lruRes.hitRatio + "%";
    optFaultSpan.innerText = optRes.faults; 
    optHitSpan.innerText = optRes.hitRatio + "%";
    
    let faultsObj = { fifo: fifoRes.faults, lru: lruRes.faults, optimal: optRes.faults };
    let minFaults = Math.min(fifoRes.faults, lruRes.faults, optRes.faults);
    let winnerText = `<span class="winner-badge">🏆 BEST (${minFaults} faults)</span>`;
    fifoWinnerDiv.innerHTML = (fifoRes.faults === minFaults) ? winnerText : `<span style="font-size:0.7rem;">—</span>`;
    lruWinnerDiv.innerHTML = (lruRes.faults === minFaults) ? winnerText : `<span style="font-size:0.7rem;">—</span>`;
    optWinnerDiv.innerHTML = (optRes.faults === minFaults) ? winnerText : `<span style="font-size:0.7rem;">—</span>`;
}

function renderTimeline(algorithmKey, stepsData, frameCount, refArray) {
    activeAlgoLabel.innerText = algorithmKey.toUpperCase();
    if(!stepsData || stepsData.length === 0) { 
        frameMatrixDiv.innerHTML = "<div style='padding:1rem'>No data</div>"; 
        return; 
    }
    
    let html = `<div style="overflow-x:auto;"><div class="step-header-row"><div class="step-header-cell" style="flex:0 0 75px;">Step</div>`;
    for(let i = 0; i < stepsData.length; i++) {
        let s = stepsData[i];
        let badge = s.isFault ? '<div class="fault-badge">⚠️</div>' : '<div class="hit-badge">✓</div>';
        html += `<div class="step-header-cell">
                    <div class="step-number">#${i+1}</div>
                    <div class="step-page-value">${s.page}</div>
                    ${badge}
                </div>`;
    }
    html += `</div>`;
    
    for(let row = 0; row < frameCount; row++) {
        html += `<div class="frame-row"><div class="frame-label-cell">F${row+1}</div>`;
        for(let col = 0; col < stepsData.length; col++) {
            let state = stepsData[col].framesSnapshot;
            let val = (row < state.length) ? state[row] : "—";
            let cls = "";
            let step = stepsData[col];
            if(step.isFault && val === step.page && state.includes(step.page) && row === state.indexOf(step.page)) {
                cls = step.replacedPage !== null ? "cell-fault-replace" : "cell-fault-new";
            }
            html += `<div class="frame-cell ${cls}">${val === "—" ? "∅" : val}</div>`;
        }
        html += `</div>`;
    }
    html += `<div style="font-size:0.65rem; margin-top:8px; color:#a5b9e0;">🟢 New Load &nbsp; 🟠 Replacement</div></div>`;
    frameMatrixDiv.innerHTML = html;
    
    // logs for selected algorithm
    let logs = "";
    for(let s of stepsData) {
        logs += `<div class="log-entry">
                    <strong>[Step ${s.stepIdx+1}]</strong> Page ${s.page} → ${s.isFault ? '❌ FAULT' : '✅ HIT'} → ${s.detail} | Frames: [${s.framesSnapshot.join(", ")}]
                </div>`;
    }
    logArea.innerHTML = logs || "<div>No logs</div>";
}

// ----- Main Comparison Execution -----
function runFullComparison() {
    let raw = refInput.value.trim();
    if(!raw) { alert("Enter reference string"); return; }
    let refArray = parseRefString(raw);
    if(refArray.length === 0) { alert("Invalid numbers"); return; }
    let frameLimit = parseInt(frameInput.value);
    if(isNaN(frameLimit)) frameLimit = 3;
    frameLimit = Math.min(8, Math.max(3, frameLimit));
    frameInput.value = frameLimit;
    
    currentRefArray = refArray;
    currentFrameCount = frameLimit;
    
    // Run three simulations
    let fifo = simulateFIFO(refArray, frameLimit);
    let lru = simulateLRU(refArray, frameLimit);
    let opt = simulateOptimal(refArray, frameLimit);
    
    // attach step index to each step
    fifo.steps = fifo.steps.map((s,idx) => ({ ...s, stepIdx: idx }));
    lru.steps = lru.steps.map((s,idx) => ({ ...s, stepIdx: idx }));
    opt.steps = opt.steps.map((s,idx) => ({ ...s, stepIdx: idx }));
    
    currentFIFOSteps = fifo.steps;
    currentLRUSteps = lru.steps;
    currentOptSteps = opt.steps;
    
    // update cards & chart
    updateComparisonUI(
        { faults: fifo.faults, hitRatio: fifo.hitRatio }, 
        { faults: lru.faults, hitRatio: lru.hitRatio }, 
        { faults: opt.faults, hitRatio: opt.hitRatio }
    );
    renderComparisonChart(fifo.steps, lru.steps, opt.steps);
    
    // render reference string
    refSequenceContainer.innerHTML = refArray.map(p => `<div class="ref-badge">${p}</div>`).join('');
    
    // render default active view (FIFO)
    activeView = 'fifo';
    renderTimeline('FIFO', currentFIFOSteps, frameLimit, refArray);
}

// ----- View Switching -----
function switchView(algo) {
    if(algo === 'fifo' && currentFIFOSteps.length) { 
        activeView = 'fifo'; 
        renderTimeline('FIFO', currentFIFOSteps, currentFrameCount, currentRefArray); 
    }
    else if(algo === 'lru' && currentLRUSteps.length) { 
        activeView = 'lru'; 
        renderTimeline('LRU', currentLRUSteps, currentFrameCount, currentRefArray); 
    }
    else if(algo === 'optimal' && currentOptSteps.length) { 
        activeView = 'optimal'; 
        renderTimeline('OPTIMAL', currentOptSteps, currentFrameCount, currentRefArray); 
    }
}

// ----- Reset to Default -----
function resetDefault() {
    refInput.value = "7,0,1,2,0,3,0,4,2,3,0,3,2,1,2,0,1,7,0,1";
    frameInput.value = "3";
    runFullComparison();
}

// ----- Event Listeners -----
simulateBtn.addEventListener('click', runFullComparison);
resetBtn.addEventListener('click', resetDefault);

// Click on cards to change detailed view
document.querySelector('.fifo-border').addEventListener('click', () => switchView('fifo'));
document.querySelector('.lru-border').addEventListener('click', () => switchView('lru'));
document.querySelector('.optimal-border').addEventListener('click', () => switchView('optimal'));

// Initial load
resetDefault();