declare module "multer" {
  type StorageEngine = unknown;

  type MulterOptions = {
    storage?: StorageEngine;
    limits?: {
      fileSize?: number;
    };
  };

  type MulterInstance = {
    single: (fieldname: string) => import("express").RequestHandler;
  };

  function multer(options?: MulterOptions): MulterInstance;

  namespace multer {
    function memoryStorage(): StorageEngine;
  }

  export = multer;
}

declare global {
  namespace Express {
    interface Request {
      file?: {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
      };
    }
  }
}

export {};
