import React, { use, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { SimpleIndexedDB } from "../util/SimpleIndexedDB";
import EventBus from "../sys/EventBus";
import { Knob } from 'react-rotary-knob-react19';
import ExplorerDialog from '../components/ExplorerDialog';
import { saveFlowToDisk, deleteFlowFromDisk, FlowData, loadRootHandle, loadFlowFromDisk, listFlowsOnDisk} from '../util/FileSystemAudioStore';

export type FlowNodeProps = {
    id: string;
    data: {
        selectedNode?: string;
        outputArr: number[];
        inputArr: number[];
        onChange?: (data: any) => void;
    };
};

const dbName = "FlowSynthDB";
const storeName = "flows";

const FlowNode: React.FC<FlowNodeProps> = ({ id, data }) => {
    const [availableNodes, setAvailableNodes] = useState<Array<{id: string; name: string; folder_path?: string; updated_at?: string}>>([]);
    const [selectedNode, setSelectedNode] = useState(data.selectedNode || "");
    const [inputArr, setInputArr] = useState<number[]>([]);
    const [outputArr, setOutputArr] = useState<number[]>([]);
    const updateNodeInternals = useUpdateNodeInternals();
    const dbRef = useRef<SimpleIndexedDB>(new SimpleIndexedDB(dbName, storeName));
    useEffect(() => {
        dbRef.current.open().catch((error) => {
            console.error("Error opening IndexedDB:", error);
        });
    }, []);
    const db = dbRef.current!;
    const eventBus = useMemo(()=> EventBus.getInstance(), []);
    type Curve = 'linear'|'logarithmic'|'exponential';
    const [embeddedKnobs, setEmbeddedKnobs] = useState<Array<{ id: string; label: string; min: number; max: number; curve: Curve; value: number }>>([]);
    const [flowQuery, setFlowQuery] = useState('');
    // Remote flows like top bar dialog
    const [serverFlows, setServerFlows] = useState<any[]>([]);
    const [publicFlows, setPublicFlows] = useState<any[]>([]);
    const [loadingRemote, setLoadingRemote] = useState(false);
    // Use global ExplorerDialog instead of small popup
    const [showExplorerDialog, setShowExplorerDialog] = useState(false);
    const remoteLoadedRef = useRef(false);

    const refreshRemoteFlows = useCallback(async ()=>{
        setLoadingRemote(true);
    }, []);

    // (Old small popup removed)

    // Helpers to convert between knob [0..1] and actual value with curve
    const clamp = (v:number, lo:number, hi:number)=> Math.min(hi, Math.max(lo, v));
    const toValue = (t:number, min:number, max:number, curve:Curve)=>{
        t = clamp(t, 0, 1);
        const span = max - min;
        switch(curve){
            case 'linear': return min + span * t;
            case 'exponential': return min + span * Math.pow(t, 3);
            case 'logarithmic': {
                const EPS = 1e-4; const loP = Math.max(EPS, min); const hiP = Math.max(loP+EPS, max); const r = hiP/loP;
                return loP * Math.pow(r, t);
            }
            default: return min + span * t;
        }
    };
    const fromValue = (v:number, min:number, max:number, curve:Curve)=>{
        const span = max - min; if (span === 0) return 0;
        v = clamp(v, Math.min(min, max), Math.max(min, max));
        switch(curve){
            case 'linear': return (v - min) / span;
            case 'exponential': {
                const t = (v - min) / span; return Math.pow(clamp(t,0,1), 1/3);
            }
            case 'logarithmic': {
                const EPS = 1e-4; const loP = Math.max(EPS, min); const hiP = Math.max(loP+EPS, max); const r = hiP/loP;
                return Math.log(v/loP) / Math.log(r);
            }
            default: return (v - min) / span;
        }
    };

    useEffect(() => {
        data.onChange?.({ selectedNode, outputArr: outputArr, inputArr: inputArr });
        const timeout = setTimeout(() => {
            updateNodeInternals(id);
        }, 100); // Throttle by 100ms

        return () => clearTimeout(timeout);

    }, [outputArr, inputArr, id]);

    const updateInputsOutputs = async () => {
        // Try disk first, fallback to DB
        const fsHandle = await loadRootHandle();
        
        // Load available nodes list
        if (fsHandle) {
            try {
                const diskFlows = await listFlowsOnDisk(fsHandle);
                setAvailableNodes(diskFlows.map((f) => ({
                    id: f.name,
                    name: f.name,
                    folder_path: f.folder_path || '',
                    updated_at: f.updated_at,
                })));
            } catch (e) {
                console.warn('[FlowNode] Disk list failed, using DB', e);
                const nodes = await db.get('*');
                setAvailableNodes(nodes.map((n: any) => ({
                    id: n.id,
                    name: n.id,
                    folder_path: n.folder_path || n.value?.folder_path || '',
                    updated_at: n.updated_at,
                })));
            }
        } else {
            const nodes = await db.get('*');
            setAvailableNodes(nodes.map((n: any) => ({
                id: n.id,
                name: n.id,
                folder_path: n.folder_path || n.value?.folder_path || '',
                updated_at: n.updated_at,
            })));
        }

        // Load selected node details (disk first)
        if (!selectedNode) {
            setInputArr([]);
            setOutputArr([]);
            setEmbeddedKnobs([]);
            return;
        }

        let record: any = null;
        if (fsHandle) {
            try {
                const diskFlow = await loadFlowFromDisk(
                    fsHandle,
                    selectedNode,
                    ''
                );
                if (diskFlow) {
                    record = diskFlow;
                }
            } catch (e) {
                console.warn('[FlowNode] Disk load failed for', selectedNode);
            }
        }

        // Fallback to DB
        if (!record) {
            const resultArr = await db.get(selectedNode);
            record = Array.isArray(resultArr) ? resultArr[0] : undefined;
        }

        if (record && Array.isArray(record.nodes)) {
            const inputNodes = record.nodes.filter(
                (n: any) => n.type === 'InputNode'
            );
            setInputArr(inputNodes.map((_: any, index: number) => index));

            const outputNodes = record.nodes.filter(
                (n: any) => n.type === 'OutputNode'
            );
            setOutputArr(outputNodes.map((_: any, index: number) => index));

            const knobs = record.nodes
                .filter((n: any) => n.type === 'MidiKnobFlowNode')
                .map((n: any) => ({
                    id: n.id,
                    label: n.data?.label ?? 'Knob',
                    min: typeof n.data?.min === 'number' ? n.data.min : 0,
                    max: typeof n.data?.max === 'number' ? n.data.max : 1,
                    curve: (n.data?.curve ?? 'linear') as Curve,
                    value: typeof n.data?.value === 'number' ? n.data.value : 0,
                }));
            setEmbeddedKnobs(knobs);
        } else {
            setInputArr([]);
            setOutputArr([]);
            setEmbeddedKnobs([]);
        }

        data.onChange?.({
            selectedNode,
            outputArr: outputArr,
            inputArr: inputArr,
        });
        updateNodeInternals(id);
    };

    useEffect(() => {
    updateInputsOutputs();
        // Fetch available custom nodes from IndexedDB
        

    }, [db, selectedNode, id, updateNodeInternals]);

    // Keep embedded control values in sync when virtual node updates params (e.g., via MIDI)
    useEffect(() => {
        const unsubscribers: Array<() => void> = [];
        embeddedKnobs.forEach(kn => {
            const event = id + '.' + kn.id + '.params.updateParams';
            const cb = (payload:any)=>{
                const d = payload?.data || payload || {};
                if (typeof d.value === 'number') {
                    setEmbeddedKnobs(prev => prev.map(p => p.id === kn.id ? { ...p, value: d.value } : p));
                }
            };
            eventBus.subscribe(event, cb);
            unsubscribers.push(() => eventBus.unsubscribe(event, cb));
        });
        return () => { unsubscribers.forEach(u => u()); };
    }, [embeddedKnobs, eventBus, id]);

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedNode(e.target.value);
        data.onChange?.({ ...data, selectedNode: e.target.value });
        updateInputsOutputs();
    };

    const handleEdit = () => {
        if (selectedNode) {
            // Navigate to the edit page for the selected node
            window.open(`/editNode/${selectedNode}`, "_blank");
            window.location.href = `/edit/${selectedNode}`;
        } else {
            alert("Please select a custom node to edit.");
        }
    };

    // Refresh IO whenever selectedNode changes (ensures handles stay synced)
    useEffect(()=>{
        if(selectedNode){
            updateInputsOutputs();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedNode]);

    // When dialog just closed and we have a selection, ensure IO are up to date
    const prevDialogRef = useRef(showExplorerDialog);
    useEffect(()=>{
        if(prevDialogRef.current && !showExplorerDialog && selectedNode){
            updateInputsOutputs();
        }
        prevDialogRef.current = showExplorerDialog;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showExplorerDialog]);

    return (
        <div
            style={{
                padding: 10,
                border: "1px solid #888",
                borderRadius: 6,
                background: "#222",
                position: "relative", // <-- Important for handle positioning
                minHeight: Math.max(10, 0 + Math.max(inputArr.length, outputArr.length) * 24), // Ensure enough height
                width: 120, // 60% of typical 200px node width
            }}
        >
            <div style={{ textAlign: "center" }}>
                <strong>Flow</strong>
            </div>
            <div style={{ margin: "8px 0" }}>
                <input
                    type="text"
                    value={flowQuery || selectedNode}
                    placeholder={selectedNode ? selectedNode : 'Select flow...'}
                    onFocus={()=>{ setFlowQuery(''); if(!remoteLoadedRef.current) refreshRemoteFlows(); setShowExplorerDialog(true); }}
                    onClick={()=>{ if(!remoteLoadedRef.current) refreshRemoteFlows(); setShowExplorerDialog(true); }}
                    readOnly
                    style={{
                        width: '90%',
                        background: '#333',
                        color: '#eee',
                        padding: '1px 6px',
                        borderRadius: 4,
                        border: '1px solid #555',
                        fontSize: 13,
                        cursor:'pointer'
                    }}
                />
            </div>
                                    {embeddedKnobs.length > 0 && (
                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #444' }}>
                                <div style={{ color:'#ccc', fontSize: 12, marginBottom: 6 }}>Controls</div>
                                            <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:10 }}>
                                                                    {embeddedKnobs.map(kn => {
                                                    const knobMin = 0, knobMax = 1000;
                                                    const knobVal = fromValue(kn.value, kn.min, kn.max, kn.curve) * (knobMax - knobMin) + knobMin;
                                                    return (
                                                                            <div key={kn.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, alignItems:'center' }}>
                                                                                <input
                                                                                    type="text"
                                                                                    value={kn.label}
                                                                                    onChange={(e)=>{
                                                                                        const lbl = e.target.value;
                                                                                        setEmbeddedKnobs(prev => prev.map(p => p.id===kn.id ? { ...p, label: lbl } : p));
                                                                                        eventBus.emit(id + '.' + kn.id + '.params.updateParams', { nodeid: id + '.' + kn.id, data: { label: lbl } });
                                                                                    }}
                                                                                    style={{ background:'#222', color:'#eee', border:'1px solid #555', borderRadius:4, padding:'2px 4px', fontSize:12, width: 120 }}
                                                                                    title="Knob label"
                                                                                />
                                                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                                                <Knob min={knobMin} max={knobMax} unlockDistance={30} value={knobVal} onChange={(kv:number)=>{
                                                                    const t = (kv - knobMin)/(knobMax - knobMin);
                                                                    const v = toValue(t, kn.min, kn.max, kn.curve);
                                                                    setEmbeddedKnobs(prev => prev.map(p => p.id===kn.id ? { ...p, value: v } : p));
                                                                    eventBus.emit(id + '.' + kn.id + '.params.updateParams', { nodeid: id + '.' + kn.id, data: { value: v } });
                                                                    eventBus.emit(id + '.' + kn.id + '.main-input.receiveNodeOn', { nodeid: id + '.' + kn.id, data: { value: v } });
                                                                }} />
                                                                <input type="number" value={kn.value}
                                                                    onChange={(e)=>{
                                                                        const v = parseFloat(e.target.value);
                                                                        setEmbeddedKnobs(prev => prev.map(p => p.id===kn.id ? { ...p, value: v } : p));
                                                                        eventBus.emit(id + '.' + kn.id + '.params.updateParams', { nodeid: id + '.' + kn.id, data: { value: v } });
                                                                        eventBus.emit(id + '.' + kn.id + '.main-input.receiveNodeOn', { nodeid: id + '.' + kn.id, data: { value: v } });
                                                                    }}
                                                                    style={{ width:90, background:'#333', color:'#eee', border:'1px solid #555', borderRadius:4, padding:'2px 4px' }} />
                                                            </div>
                                                            <div style={{ fontSize:10, color:'#aaa' }}>{kn.curve}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                            </div>
                        )}
            {/* Render input handles */}
            {Array.from({ length: inputArr.length }).map((_, i) => {
                const top = 10 + i * 24;
                return (
                    <Handle
                        key={`input-${i}`}
                        type="target"
                        position={Position.Left}
                        id={`input-${i}`}
                        style={{
                            top,
                            background: "#0af"
                        }}
                        isConnectable={true}
                    />
                );
            })}
            {/* Render output handles */}
            {Array.from({ length: outputArr.length }).map((_, i) => (
                <Handle
                    key={`output-${i}`}
                    type="source"
                    position={Position.Right}
                    id={`output-${i}`}
                    style={{
                        top: 10 + i * 24,
                        background: "#fa0",
                    }}
                    isConnectable={true}
                />
            ))}
            {showExplorerDialog && (
                <ExplorerDialog
                    open={showExplorerDialog}
                    localFlows={availableNodes.map(n => ({ ...n, _source:'local' as const }))}
                    myFlows={serverFlows.map(f => ({ ...f, _source:'mine' as const }))}
                    publicFlows={publicFlows.map(f => ({ ...f, _source:'public' as const }))}
                    loading={loadingRemote}
                    onRefresh={refreshRemoteFlows}
                    onRenameFlow={(flow, newName) => {
                        (async () => {
                            // Handle local flows
                            if (flow._source === 'local') {
                                const recs = await db.get(flow.name);
                                if (recs && recs[0]) {
                                    try { await db.delete(flow.name); } catch { }

                                    // For flows embedded in a FlowNode, we save the stored version, not the editor's.
                                    const nodesToSave = recs[0].nodes || recs[0].value?.nodes || [];
                                    const edgesToSave = recs[0].edges || recs[0].value?.edges || [];

                                    await db.put(newName, { nodes: nodesToSave, edges: edgesToSave, folder_path: recs[0].folder_path || recs[0].value?.folder_path || '', updated_at: new Date().toISOString() });
                                    
                                    // Update the internal state of the FlowNode
                                    setAvailableNodes(prev => prev.map(n => n.name === flow.name ? { ...n, id: newName, name: newName } : n).filter(n => n.name !== flow.name).concat({ id: newName, name: newName, folder_path: flow.folder_path, updated_at: new Date().toISOString() }));
                                    if (selectedNode === flow.name) { 
                                        setSelectedNode(newName); 
                                        data.onChange?.({ ...data, selectedNode: newName });
                                    }
                                    
                                    // Also rename on disk if fs handle is present
                                    const fsRootHandle = await loadRootHandle();
                                    if(fsRootHandle){
                                      try {
                                        await deleteFlowFromDisk(fsRootHandle, flow.name, flow.folder_path);
                                        const flowData: FlowData = {
                                          name: newName,
                                          nodes: nodesToSave,
                                          edges: edgesToSave,
                                          folder_path: flow.folder_path,
                                          updated_at: new Date().toISOString()
                                        };
                                        await saveFlowToDisk(fsRootHandle, flowData);
                                      } catch(e){ console.warn('Disk rename failed during local rename', e); }
                                    }
                                }
                            }
                    
                        })();
                    }}
                    onOpenLocal={(name) => {
                        setSelectedNode(name);
                        setFlowQuery('');
                        data.onChange?.({ ...data, selectedNode: name });
                        setShowExplorerDialog(false);
                        updateInputsOutputs();
                    }}
                    onClose={()=> setShowExplorerDialog(false)}
                    title="Select Flow"
                    localLabel="Local Flows"
                    myLabel="My Flows"
                    publicLabel="All Published by Users"
                    backgroundColor="#161616"
                    headerBackgroundColor="#1f1f1f"
                    usePortal
                    fullScreen
                />
            )}
        </div>
    );
};

export default FlowNode;