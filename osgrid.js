// OS National Grid <-> WGS84 lat/long (Helmert transform + Transverse Mercator).
// Accurate to a few metres, plenty for get-ins and take-outs.
(function (root) {
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const AIRY = { a: 6377563.396, b: 6356256.909 };
  const WGS = { a: 6378137, b: 6356752.3142 };
  const F0 = 0.9996012717, lat0 = rad(49), lon0 = rad(-2), N0 = -100000, E0 = 400000;
  const LET = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

  function toCart(lat, lon, h, e) {
    const e2 = 1 - (e.b * e.b) / (e.a * e.a), s = Math.sin(lat), c = Math.cos(lat);
    const nu = e.a / Math.sqrt(1 - e2 * s * s);
    return [(nu + h) * c * Math.cos(lon), (nu + h) * c * Math.sin(lon), ((1 - e2) * nu + h) * s];
  }
  function fromCart(p, e) {
    const [x, y, z] = p, e2 = 1 - (e.b * e.b) / (e.a * e.a), q = Math.sqrt(x * x + y * y);
    let lat = Math.atan2(z, q * (1 - e2)), prev = 2 * Math.PI;
    while (Math.abs(lat - prev) > 1e-12) {
      const nu = e.a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
      prev = lat; lat = Math.atan2(z + e2 * nu * Math.sin(lat), q);
    }
    return [lat, Math.atan2(y, x)];
  }
  function helmert(p, t) {
    const [x, y, z] = p, s = 1 + t.s * 1e-6;
    const rx = rad(t.rx / 3600), ry = rad(t.ry / 3600), rz = rad(t.rz / 3600);
    return [t.tx + x * s - y * rz + z * ry, t.ty + x * rz + y * s - z * rx, t.tz - x * ry + y * rx + z * s];
  }
  const TO_OSGB = { tx: -446.448, ty: 125.157, tz: -542.06, s: 20.4894, rx: -0.1502, ry: -0.247, rz: -0.8421 };
  const TO_WGS = { tx: 446.448, ty: -125.157, tz: 542.06, s: -20.4894, rx: 0.1502, ry: 0.247, rz: 0.8421 };

  function meridional(lat) {
    const { a, b } = AIRY, n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n;
    const d = lat - lat0, s = lat + lat0;
    return b * F0 * ((1 + n + 1.25 * n2 + 1.25 * n3) * d
      - (3 * n + 3 * n2 + 2.625 * n3) * Math.sin(d) * Math.cos(s)
      + (1.875 * n2 + 1.875 * n3) * Math.sin(2 * d) * Math.cos(2 * s)
      - (35 / 24) * n3 * Math.sin(3 * d) * Math.cos(3 * s));
  }

  function latLonToEN(latD, lonD) {
    const [lat, lon] = fromCart(helmert(toCart(rad(latD), rad(lonD), 0, WGS), TO_OSGB), AIRY);
    const { a, b } = AIRY, e2 = 1 - (b * b) / (a * a);
    const s = Math.sin(lat), c = Math.cos(lat), t = Math.tan(lat);
    const nu = a * F0 / Math.sqrt(1 - e2 * s * s), rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5);
    const eta2 = nu / rho - 1, M = meridional(lat);
    const I = M + N0, II = nu / 2 * s * c, III = nu / 24 * s * c ** 3 * (5 - t * t + 9 * eta2);
    const IIIA = nu / 720 * s * c ** 5 * (61 - 58 * t * t + t ** 4);
    const IV = nu * c, V = nu / 6 * c ** 3 * (nu / rho - t * t);
    const VI = nu / 120 * c ** 5 * (5 - 18 * t * t + t ** 4 + 14 * eta2 - 58 * t * t * eta2);
    const dl = lon - lon0;
    return [E0 + IV * dl + V * dl ** 3 + VI * dl ** 5, I + II * dl ** 2 + III * dl ** 4 + IIIA * dl ** 6];
  }

  function enToLatLon(E, N) {
    const { a, b } = AIRY, e2 = 1 - (b * b) / (a * a);
    let lat = lat0, M = 0;
    do { lat = (N - N0 - M) / (a * F0) + lat; M = meridional(lat); } while (Math.abs(N - N0 - M) >= 0.00001);
    const s = Math.sin(lat), c = Math.cos(lat), t = Math.tan(lat);
    const nu = a * F0 / Math.sqrt(1 - e2 * s * s), rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5);
    const eta2 = nu / rho - 1, sec = 1 / c;
    const VII = t / (2 * rho * nu), VIII = t / (24 * rho * nu ** 3) * (5 + 3 * t * t + eta2 - 9 * t * t * eta2);
    const IX = t / (720 * rho * nu ** 5) * (61 + 90 * t * t + 45 * t ** 4);
    const X = sec / nu, XI = sec / (6 * nu ** 3) * (nu / rho + 2 * t * t);
    const XII = sec / (120 * nu ** 5) * (5 + 28 * t * t + 24 * t ** 4);
    const XIIA = sec / (5040 * nu ** 7) * (61 + 662 * t * t + 1320 * t ** 4 + 720 * t ** 6);
    const dE = E - E0;
    const latA = lat - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6;
    const lonA = lon0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7;
    const [la, lo] = fromCart(helmert(toCart(latA, lonA, 0, AIRY), TO_WGS), WGS);
    return [deg(la), deg(lo)];
  }

  // lat/long -> "SX 7506 6594" (null if outside the GB grid)
  function toGridRef(latD, lonD, digits) {
    digits = digits || 8;
    const [E, N] = latLonToEN(latD, lonD);
    if (!(E >= 0 && E < 700000 && N >= 0 && N < 1300000)) return null;
    const e100 = Math.floor(E / 100000), n100 = Math.floor(N / 100000);
    const l1 = (19 - n100) - (19 - n100) % 5 + Math.floor((e100 + 10) / 5);
    const l2 = (19 - n100) * 5 % 25 + e100 % 5;
    const half = digits / 2, div = Math.pow(10, 5 - half);
    const pad = v => String(Math.floor((v % 100000) / div)).padStart(half, '0');
    return LET[l1] + LET[l2] + ' ' + pad(E) + ' ' + pad(N);
  }

  // "SX 7506 6594" / "SX75066594" -> [lat, lon] (null if not a grid ref)
  function fromGridRef(ref) {
    const m = String(ref || '').toUpperCase().replace(/\s+/g, ' ').trim().match(/^([A-HJ-Z]{2})\s?(\d+)\s?(\d*)$/);
    if (!m) return null;
    let e = m[2], n = m[3];
    if (!n) { if (e.length % 2) return null; n = e.slice(e.length / 2); e = e.slice(0, e.length / 2); }
    if (e.length !== n.length || e.length < 2 || e.length > 5) return null;
    const l1 = LET.indexOf(m[1][0]), l2 = LET.indexOf(m[1][1]);
    const e100 = ((l1 - 2) % 5) * 5 + (l2 % 5), n100 = (19 - Math.floor(l1 / 5) * 5) - Math.floor(l2 / 5);
    const scale = Math.pow(10, 5 - e.length);
    // centre of the square the reference describes
    const E = e100 * 100000 + (Number(e) + 0.5) * scale, N = n100 * 100000 + (Number(n) + 0.5) * scale;
    return enToLatLon(E, N);
  }

  root.OSGrid = { toGridRef, fromGridRef, latLonToEN, enToLatLon };
})(typeof window !== 'undefined' ? window : globalThis);
