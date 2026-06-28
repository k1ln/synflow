#pragma once

#include <vector>

// M4 — native event system. The web routes control events (note on/off, values)
// through a string-keyed EventBus dispatched asynchronously via setTimeout, so
// timing is wall-clock and non-deterministic. The native engine replaces that
// with a DETERMINISTIC, sample-stamped queue: events carry a sample offset
// within the current block and are routed along event-edges in topological
// order, so a sequenced flow is transport-locked and reproducible. (Web stays
// untouched — this is native-only.)
namespace synflow {

enum class EventType {
    NoteOn,   // gate on  (value = velocity/bpm/payload)
    NoteOff,  // gate off
    Value,    // a scalar control value (value = the number)
};

// One event delivered to a node's input. `port` is the target input port;
// `sampleOffset` is the exact sample within the block at which it fires.
struct GraphEvent {
    EventType type;
    double value = 0.0;
    int sampleOffset = 0;
    int port = 0;
};

// Nodes emit through this sink (implemented by AudioGraphManager); emits are
// routed along event-edges to the target nodes' inboxes, which — because they
// come later in topological order — see them in the same block.
class IEventSink {
public:
    virtual ~IEventSink() = default;
    virtual void emitEvent(int fromNode, int fromPort, EventType type, double value, int sampleOffset) = 0;
};

} // namespace synflow
