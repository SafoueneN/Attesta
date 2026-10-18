export function problem(code, status, title, errors, requestId) {
    const body = { type: `urn:attesta:erreur:${code}`, title, status };
    if (errors?.length)
        body.errors = errors;
    if (requestId)
        body.requestId = requestId;
    return body;
}
