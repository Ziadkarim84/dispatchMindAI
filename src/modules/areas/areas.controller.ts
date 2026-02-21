import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '@common/utils/response.util';
import { query } from '@database/connection';

interface AreaRow {
  id: number;
  name: string;
  name_bn: string | null;
}

/**
 * GET /api/v1/areas
 * Returns all active areas that have an active hub mapping in sl_area_hub.
 * Used to populate the area dropdown in the frontend.
 */
export async function listAreas(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await query<AreaRow[]>(
      `SELECT DISTINCT a.ID AS id, a.NAME AS name, a.NAME_BN AS name_bn
       FROM sl_areas a
       INNER JOIN sl_area_hub ah ON ah.AREA_ID = a.ID AND ah.STATUS = 'active'
       WHERE a.STATUS = 'active'
       ORDER BY a.NAME ASC`,
    );
    sendSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}
