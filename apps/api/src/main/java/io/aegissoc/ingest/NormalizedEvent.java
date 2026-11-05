package io.aegissoc.ingest;

import java.time.Instant;

/** Vendor-neutral event. {@code id} is null until persisted. Raw vendor payload lives in raw_events. */
public record NormalizedEvent(
        Long id,
        Instant ts,
        String originalTs,
        String eventClass,
        String action,
        String outcome,
        int severity,
        String host,
        String username,
        String srcIp,
        String dstIp,
        Integer dstPort,
        String domain,
        String processName,
        String processCmdline,
        String parentProcess,
        String message,
        String vendor,
        String vendorRef,
        boolean synthetic) {

    public NormalizedEvent withId(long newId) {
        return new NormalizedEvent(newId, ts, originalTs, eventClass, action, outcome, severity, host, username, srcIp, dstIp,
                dstPort, domain, processName, processCmdline, parentProcess, message, vendor, vendorRef, synthetic);
    }

    /** Field accessor used by the constrained rule engine (whitelisted names only). */
    public Object field(String name) {
        return switch (name) {
            case "event_class" -> eventClass;
            case "action" -> action;
            case "outcome" -> outcome;
            case "severity" -> severity;
            case "host" -> host;
            case "username" -> username;
            case "src_ip" -> srcIp;
            case "dst_ip" -> dstIp;
            case "dst_port" -> dstPort;
            case "domain" -> domain;
            case "process_name" -> processName;
            case "process_cmdline" -> processCmdline;
            case "parent_process" -> parentProcess;
            case "message" -> message;
            case "vendor" -> vendor;
            case "vendor_ref" -> vendorRef;
            default -> throw new IllegalArgumentException("Unknown event field: " + name);
        };
    }
}
