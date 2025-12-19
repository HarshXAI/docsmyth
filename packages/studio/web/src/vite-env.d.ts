/// <reference types="vite/client" />

declare module '*.css' {
    const content: string;
    export default content;
}

declare module 'react-json-view-lite/dist/index.css' {
    const content: string;
    export default content;
}
