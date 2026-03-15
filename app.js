import React, { useCallback, useMemo, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
const { ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge, MiniMap } = window.ReactFlow;

// ---- Node Renderers ----
const Box = ({ title, lines=[] }) => (
  <div style={{padding:8, border:'1px solid #94a3b8', borderRadius:8, background:'#fff', minWidth:160}}>
    <div style={{fontWeight:700}}>{title}</div>
    {lines.map((l,i)=> <div key={i} style={{fontSize:12, color:'#334155'}}>{l}</div>)}
  </div>
);

const HtstNode = ({ data }) => <Box title="HTST (PHE)" lines={["Outlets: 85°C / 42°C / 4°C"]}/>
const ValveNode = ({ data }) => <Box title="3‑way Valve" lines={[data?.modes?.join(' / ')||'']}/>
const SepNode   = ({ data }) => <Box title="Cream Separator" lines={[`Skim fat: ${data?.skimFat||0.06}%`,`Cream fat: ${data?.creamFat||40}%`]}/>
const StdNode   = ({ data }) => <Box title="Std. Tank (Toned)" lines={[`Target fat: ${data?.finalFat||2}%`]} />
const PaneerNode= ({ data }) => <Box title="Paneer Vat" lines={["85–90°C → cool 70–75°C","Add acid (citric/lactic)"]} />
const CurdNode  = ({ data }) => <Box title="Curd Tank" lines={["Inoc. 42–45°C", "Chill ≤5°C after set"]} />
const BmcNode   = ({ data }) => <Box title="BMC" lines={["Storage ≤4°C"]} />
const PouchNode = ({ data }) => <Box title="Pouch Filler" lines={["Fill ≤4°C"]} />
const GheeNode  = ({ data }) => <Box title="Ghee/Khoya" lines={["Cream input"]} />

const nodeTypes = { htst: HtstNode, valve: ValveNode, sep: SepNode, std: StdNode, paneer: PaneerNode, curd: CurdNode, bmc: BmcNode, pouch: PouchNode, ghee: GheeNode };

// ---- Defaults ----
const defaultNodes = [
  { id:'htst', type:'htst', position:{x:50,y:150}, data:{} },
  { id:'v42',  type:'valve', position:{x:270,y:140}, data:{ modes:['Separator','Curd'] } },
  { id:'sep',  type:'sep', position:{x:520,y:80}, data:{ skimFat:0.06, creamFat:40 } },
  { id:'curd', type:'curd', position:{x:520,y:210}, data:{} },
  { id:'std',  type:'std', position:{x:760,y:140}, data:{ finalFat:2 } },
  { id:'ghee', type:'ghee', position:{x:760,y:40}, data:{} },
  { id:'v4',   type:'valve', position:{x:270,y:260}, data:{ modes:['BMC','Pouch'] } },
  { id:'bmc',  type:'bmc', position:{x:520,y:260}, data:{} },
  { id:'pouch',type:'pouch', position:{x:520,y:340}, data:{} },
  { id:'paneer',type:'paneer', position:{x:520,y:0}, data:{} },
];

const defaultEdges = [
  { id:'e-htst-v42', source:'htst', target:'v42', label:'42°C' },
  { id:'e-htst-v4',  source:'htst', target:'v4',  label:'4°C' },
  { id:'e-htst-pane',source:'htst', target:'paneer', label:'85–90°C' },
  { id:'e-v42-sep',  source:'v42',  target:'sep', label:'→ Separator' },
  { id:'e-v42-curd', source:'v42',  target:'curd',label:'→ Curd' },
  { id:'e-sep-std1', source:'sep',  target:'std', label:'Skim → Std.' },
  { id:'e-sep-ghee', source:'sep',  target:'ghee',label:'Cream → Ghee' },
  { id:'e-std-v4',   source:'std',  target:'v4',  label:'Chill to 4°C' },
  { id:'e-v4-bmc',   source:'v4',   target:'bmc', label:'→ BMC' },
  { id:'e-v4-pouch', source:'v4',   target:'pouch', label:'→ Pouch' },
];

function computeCreamFraction(finalFat, skimFat, creamFat){
  const num = finalFat - skimFat; const den = creamFat - finalFat; if(den<=0) return 0;
  return +(num/den).toFixed(4);
}

function App(){
  const [nodes, setNodes, onNodesChange] = useNodesState(JSON.parse(localStorage.getItem('nodes')||'null') || defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(JSON.parse(localStorage.getItem('edges')||'null') || defaultEdges);
  const onConnect = useCallback((params)=> setEdges((eds)=> addEdge({...params, animated:true}, eds)), []);

  // selected node state
  const [sel, setSel] = useState(null);
  const onNodeClick = (_, node) => setSel(node);

  // persist
  useEffect(()=> { localStorage.setItem('nodes', JSON.stringify(nodes)); localStorage.setItem('edges', JSON.stringify(edges)); }, [nodes, edges]);

  // validations (basic):
  const validations = useMemo(()=>{
    // If sep connected from htst via v42 with label '42°C' ok, else warn
    const okSepFeed = edges.some(e=> e.target==='sep' && e.source==='v42');
    const okPaneer  = edges.some(e=> e.target==='paneer' && e.source==='htst');
    const okPouch   = edges.some(e=> e.target==='pouch' && e.source==='v4');
    return {
      sepFeed: okSepFeed,
      paneer: okPaneer,
      pouch: okPouch,
    };
  },[edges]);

  // compute toned blend quick calc from selected Std node inputs
  const stdNode = nodes.find(n=> n.id==='std');
  const sepNode = nodes.find(n=> n.id==='sep');
  const finalFat = stdNode?.data?.finalFat ?? 2;
  const skimFat  = sepNode?.data?.skimFat  ?? 0.06;
  const creamFat = sepNode?.data?.creamFat ?? 40;
  const frac = computeCreamFraction(+finalFat, +skimFat, +creamFat);

  const setNodeData = (id, patch) => setNodes(ns => ns.map(n => n.id===id ? ({...n, data:{...n.data, ...patch}}) : n));

  const exportPNG = async()=>{
    const el = document.querySelector('#flow');
    const dataUrl = await window.htmlToImage.toPng(el, {backgroundColor:'#fff'});
    const a = document.createElement('a'); a.href = dataUrl; a.download = 'flow.png'; a.click();
  };

  const exportPDF = async()=>{
    const el = document.querySelector('#flow');
    const dataUrl = await window.htmlToImage.toPng(el, {backgroundColor:'#fff'});
    const { jsPDF } = window.jspdf; const pdf = new jsPDF({orientation:'landscape'});
    const imgProps = pdf.getImageProperties(dataUrl);
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW/imgProps.width, pageH/imgProps.height);
    const w = imgProps.width*ratio, h = imgProps.height*ratio;
    pdf.addImage(dataUrl, 'PNG', (pageW-w)/2, 10, w, h);
    pdf.setFontSize(10);
    pdf.text(`Cream fraction for ${finalFat}% (skim ${skimFat}%, cream ${creamFat}%): ${Math.round(frac*1000)/10}% of final volume`, 10, pageH-10);
    pdf.save('HTST_Flow_Sheet.pdf');
  };

  const reset = ()=>{ localStorage.removeItem('nodes'); localStorage.removeItem('edges'); location.reload(); };

  return (
    <div>
      <div className="header">
        <div className="title">HTST Flow Builder <span className="badge">drag‑drop</span></div>
        <div className="toolbar">
          <button onClick={exportPNG}>Export PNG</button>
          <button onClick={exportPDF}>Export PDF</button>
          <button className="secondary" onClick={reset}>Reset</button>
        </div>
      </div>

      <div className="container">
        {/* Sidebar: Palette */}
        <div className="sidebar">
          <h3>Blocks</h3>
          <div className="node-palette">
            <div className="note">Drag nodes on canvas (hold & move). Edges connect by dragging from a node to another node.</div>
            <div className="legend" style={{marginTop:8}}>
              <div><b>Guidance</b></div>
              <div>• 42°C → Separator / Curd</div>
              <div>• 85–90°C → Paneer</div>
              <div>• 4°C → BMC / Pouch</div>
            </div>
            <div className="note" style={{marginTop:8}}>
              Status: Separator feed <b className={validations.sepFeed?'valid':'invalid'}>{validations.sepFeed?'OK':'Missing'}</b>, Paneer route <b className={validations.paneer?'valid':'invalid'}>{validations.paneer?'OK':'Missing'}</b>, Pouch route <b className={validations.pouch?'valid':'invalid'}>{validations.pouch?'OK':'Missing'}</b>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="canvas">
          <div id="flow">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
            >
              <Background />
              <MiniMap />
              <Controls />
            </ReactFlow>
          </div>
        </div>

        {/* Properties Panel */}
        <div className="prop-panel">
          <h3>Properties</h3>
          {!sel && <div className="note">Click a node to edit. Values auto‑save to browser.</div>}
          {sel?.type==='sep' && (
            <div>
              <div className="field">
                <label>Skim fat %</label>
                <input type="number" step="0.01" value={sel.data.skimFat}
                  onChange={e=> setNodeData('sep', { skimFat: +e.target.value }) } />
              </div>
              <div className="field">
                <label>Cream fat %</label>
                <input type="number" step="0.1" value={sel.data.creamFat}
                  onChange={e=> setNodeData('sep', { creamFat: +e.target.value }) } />
              </div>
            </div>
          )}
          {sel?.id==='std' && (
            <div>
              <div className="field">
                <label>Final fat % (toned)</label>
                <input type="number" step="0.01" value={sel.data.finalFat}
                  onChange={e=> setNodeData('std', { finalFat: +e.target.value }) } />
              </div>
              <div className="legend">
                Cream fraction formula:<br/>
                (F<sub>final</sub> − F<sub>skim</sub>) / (F<sub>cream</sub> − F<sub>final</sub>)<br/>
                With skim {skimFat}% & cream {creamFat}% → <b>{(frac*100).toFixed(2)}%</b> of final volume as cream.
              </div>
            </div>
          )}
          {sel && !['sep','std'].includes(sel.type) && (
            <div className="note">No editable fields for this block.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App/>);
