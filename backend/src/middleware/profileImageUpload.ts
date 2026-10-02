import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { open, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";

export const profileImageUrlPrefix = "/uploads/profile-images/";

/**
 * Where uploaded profile photographs are written.
 *
 * `PROFILE_IMAGE_DIR` exists for hosts that do not let a process write next to
 * its own code. On a serverless host the deployed files are read-only and only
 * a temporary directory can be written to, so the path has to be somewhere the
 * host chooses rather than somewhere this file assumes.
 */
export const profileImagesDirectory = process.env.PROFILE_IMAGE_DIR
  ? path.resolve(process.env.PROFILE_IMAGE_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads/profile-images");

/**
 * Creating this directory must never be able to stop the server booting.
 *
 * This runs when the module is first imported, which is while the application
 * is being assembled. On a read-only filesystem it throws EROFS, and because it
 * is at the top level that one failure takes down the whole API - every route,
 * not just the one that uploads a photograph. A host where photographs cannot
 * be stored should refuse photographs, not refuse to start, so the failure is
 * carried to the upload itself where it can be reported to the person doing it.
 */
let uploadsWritable = true;
try {
  mkdirSync(profileImagesDirectory, { recursive: true });
} catch (error) {
  uploadsWritable = false;
  console.warn(
    `Profile photographs are disabled: ${profileImagesDirectory} is not writable. ` +
    `Set PROFILE_IMAGE_DIR to a writable path to enable them.`,
    error,
  );
}

/** Whether this host can store a profile photograph at all. */
export const profileImagesEnabled = () => uploadsWritable;

const extensionsByMimeType: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const upload = multer({
  storage: multer.diskStorage({
    // The callback form, not the string form: given a string, multer creates
    // the directory itself while this module is being imported, which puts a
    // second unguarded mkdir on the boot path and defeats the handling above.
    destination: (_request, _file, callback) => callback(null, profileImagesDirectory),
    filename: (_request, file, callback) => {
      callback(null, `${randomUUID()}${extensionsByMimeType[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!extensionsByMimeType[file.mimetype]) {
      callback(new Error("Only JPG, PNG and WEBP images are allowed"));
      return;
    }

    callback(null, true);
  },
});

async function hasValidImageSignature(file: Express.Multer.File): Promise<boolean> {
  const handle = await open(file.path, "r");

  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);

    if (file.mimetype === "image/jpeg") {
      return bytesRead >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    }

    if (file.mimetype === "image/png") {
      return (
        bytesRead >= 8 &&
        header.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )
      );
    }

    return (
      file.mimetype === "image/webp" &&
      bytesRead >= 12 &&
      header.subarray(0, 4).toString("ascii") === "RIFF" &&
      header.subarray(8, 12).toString("ascii") === "WEBP"
    );
  } finally {
    await handle.close();
  }
}

export function acceptProfileImage(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  // Said plainly, and only to the person who tried. Letting multer attempt the
  // write would surface this as an unexplained 500.
  if (!uploadsWritable) {
    response.status(503).json({
      success: false,
      message: "Profile photographs cannot be stored on this server.",
    });
    return;
  }

  upload.single("image")(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Profile image must be 2 MB or smaller"
          : error.code === "LIMIT_UNEXPECTED_FILE"
            ? 'Upload one image using the field name "image"'
            : "Profile image upload could not be processed";

      response.status(400).json({ success: false, message });
      return;
    }

    if (error instanceof Error) {
      response.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    }

    if (!request.file) {
      next();
      return;
    }

    void hasValidImageSignature(request.file)
      .then(async (isValid) => {
        if (!isValid) {
          await unlink(request.file!.path).catch(() => undefined);
          response.status(400).json({
            success: false,
            message: "The uploaded file content is not a valid JPG, PNG or WEBP image",
          });
          return;
        }

        next();
      })
      .catch(async (validationError: unknown) => {
        await unlink(request.file!.path).catch(() => undefined);
        next(validationError);
      });
  });
}
