declare module 'pdfmake/build/pdfmake' {
  import type { TDocumentDefinitions, TCreatedPdf } from 'pdfmake/interfaces';

  const pdfMake: {
    createPdf(documentDefinitions: TDocumentDefinitions): TCreatedPdf;
    addVirtualFileSystem(vfs: Record<string, string>): void;
    addFonts(fonts: Record<string, unknown>): void;
    fonts: unknown;
  };

  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>;
  export default vfs;
}
