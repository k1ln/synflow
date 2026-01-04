import EventBus from './EventBus';

(function attach(){
  try {
    const eventBus = EventBus.getInstance();
    (window as any).flowSynth = (window as any).flowSynth || {};
    (window as any).flowSynth.emit = (eventName: string, payload?: any) => {
      try { eventBus.emit(eventName, payload); } catch { /* noop */ }
    };
    (window as any).flowSynth.listEvents = () => {
      try { return eventBus.listEvents(); } catch { return []; }
    };
    (window as any).flowSynth.on = (eventName: string, cb: (d:any)=>void) => {
      try { eventBus.subscribe(eventName, cb); return () => eventBus.unsubscribe(eventName, cb); } catch { return () => {}; }
    };
    (window as any).flowSynth.off = (eventName: string, cb: (d:any)=>void) => {
      try { eventBus.unsubscribe(eventName, cb); } catch { /* noop */ }
    };
  } catch { /* ignore */ }
})();
