import type {NextConfig} from "next";
const config:NextConfig={outputFileTracingIncludes:{"/api/viral/*":["./server/viral/**/*"]}};
export default config;
