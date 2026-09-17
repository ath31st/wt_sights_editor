/// <reference types="vite/client" />

declare module "@catalog" {
  import type { CatalogFile } from "@wt_sights_editor/core";
  const catalog: CatalogFile;
  export default catalog;
}
