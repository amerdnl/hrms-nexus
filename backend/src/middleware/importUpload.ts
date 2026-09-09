import type { NextFunction, Request, Response } from "express";
import multer from "multer";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Import files are held in memory and parsed immediately; nothing is written to
 * disk. Uploads are admin-only and bounded, and the parser is the real gate —
 * a mislabelled file fails there with a readable message.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1, fields: 4 },
  fileFilter: (_request, file, callback) => {
    if (!/\.(csv|xlsx)$/i.test(file.originalname)) {
      callback(new Error("Upload a .csv or .xlsx file."));
      return;
    }
    callback(null, true);
  },
});

const single = upload.single("file");

export function importFileUpload(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  single(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? `The file is larger than ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB.`
        : "The upload could not be read. Send one file in a 'file' field.";
      response.status(400).json({ success: false, message });
      return;
    }

    if (error) {
      response.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "The upload could not be read.",
      });
      return;
    }

    if (!request.file) {
      response.status(400).json({ success: false, message: "Choose a file to import." });
      return;
    }

    next();
  });
}
