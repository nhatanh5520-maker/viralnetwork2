import type {NextConfig} from "next";
const config:NextConfig={outputFileTracingIncludes:{"/api/viral/*":["./server/viral/**/*"],"/api/viral/hr/accounts":["./server/viral/**/*"]}};
export default config;
