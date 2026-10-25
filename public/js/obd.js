/**
 * Diagnóstico y Mecánica - Módulo de Comunicación OBD-II / ELM327
 * Soporta:
 *  - Web Serial API (USB / Serie: FTDI, CH340, CP2102, PL2303)
 *  - Web Bluetooth API (BLE / SPP)
 *  - Simulador Virtual de ECU (para pruebas y navegadores sin soporte hardware)
 */

class OBDParser {
  // Limpia respuestas de caracteres de control, prompts y ecos
  static clean(raw) {
    if (!raw) return '';
    return raw
      .replace(/>/g, '')
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/SEARCHING\.\.\./gi, '')
      .replace(/STOPPED/gi, '')
      .trim();
  }

  // Comprueba si la respuesta contiene un error típico de ELM327
  static isError(raw) {
    const s = this.clean(raw).toUpperCase();
    if (!s) return true;
    return (
      s.includes('NO DATA') ||
      s.includes('CAN ERROR') ||
      s.includes('BUS INIT') ||
      s.includes('BUS ERROR') ||
      s.includes('UNABLE TO CONNECT') ||
      s.includes('ERROR') ||
      s.includes('?') ||
      s.includes('FB ERROR')
    );
  }

  // Convierte string hexadecimal (ej: "41 0C 1A F8") a array de bytes [0x41, 0x0C, 0x1A, 0xF8]
  static hexToBytes(raw) {
    const s = this.clean(raw).replace(/\s+/g, '');
    const bytes = [];
    for (let i = 0; i < s.length; i += 2) {
      const hex = s.substring(i, i + 2);
      if (hex.length === 2) {
        const val = parseInt(hex, 16);
        if (!isNaN(val)) bytes.push(val);
      }
    }
    return bytes;
  }

  // Decodifica parámetros del Modo 01
  static parseMode01(pid, raw) {
    const bytes = this.hexToBytes(raw);
    // La respuesta típica de Modo 01 es 41 <PID> <DATA...>
    const idx = bytes.indexOf(0x41);
    if (idx === -1) return null;

    const data = bytes.slice(idx + 2);
    const pidHex = pid.toUpperCase().replace(/\s+/g, '').replace(/^01/, '');

    switch (pidHex) {
      case '0C': { // RPM: ((A*256)+B)/4
        if (data.length < 2) return null;
        return { pid: '010C', name: 'RPM Motor', value: Math.round(((data[0] * 256) + data[1]) / 4), unit: 'RPM' };
      }
      case '0D': { // Velocidad: A
        if (data.length < 1) return null;
        return { pid: '010D', name: 'Velocidad', value: data[0], unit: 'km/h' };
      }
      case '05': { // Temp refrigerante: A - 40
        if (data.length < 1) return null;
        return { pid: '0105', name: 'Temp. Refrigerante', value: data[0] - 40, unit: '°C' };
      }
      case '04': { // Carga motor: A * 100 / 255
        if (data.length < 1) return null;
        return { pid: '0104', name: 'Carga Motor', value: Math.round((data[0] * 100) / 255), unit: '%' };
      }
      case '0F': { // Temp aire admisión: A - 40
        if (data.length < 1) return null;
        return { pid: '010F', name: 'Temp. Admisión', value: data[0] - 40, unit: '°C' };
      }
      case '11': { // Posición mariposa: A * 100 / 255
        if (data.length < 1) return null;
        return { pid: '0111', name: 'Posición Acelerador', value: Math.round((data[0] * 100) / 255), unit: '%' };
      }
      case '10': { // Flujo masa de aire MAF: ((A*256)+B)/100
        if (data.length < 2) return null;
        return { pid: '0110', name: 'Flujo MAF', value: Number((((data[0] * 256) + data[1]) / 100).toFixed(2)), unit: 'g/s' };
      }
      case '06': { // Corrección corto plazo banco 1: 100/128*A - 100
        if (data.length < 1) return null;
        return { pid: '0106', name: 'Corrección corto plazo B1', value: Number(((100 / 128) * data[0] - 100).toFixed(1)), unit: '%' };
      }
      case '07': { // Corrección largo plazo banco 1: 100/128*A - 100
        if (data.length < 1) return null;
        return { pid: '0107', name: 'Corrección largo plazo B1', value: Number(((100 / 128) * data[0] - 100).toFixed(1)), unit: '%' };
      }
      case '0A': { // Presión de combustible: 3*A
        if (data.length < 1) return null;
        return { pid: '010A', name: 'Presión de combustible', value: data[0] * 3, unit: 'kPa' };
      }
      case '0B': { // Presión absoluta del colector: A
        if (data.length < 1) return null;
        return { pid: '010B', name: 'Presión del colector', value: data[0], unit: 'kPa' };
      }
      case '0E': { // Avance de encendido: A/2 - 64
        if (data.length < 1) return null;
        return { pid: '010E', name: 'Avance de encendido', value: Number((data[0] / 2 - 64).toFixed(1)), unit: '°' };
      }
      case '14': { // Sonda lambda B1S1: A/200 V y 100/128*B - 100 %
        if (data.length < 2) return null;
        const trim = Number(((100 / 128) * data[1] - 100).toFixed(1));
        return { pid: '0114', name: 'Sonda lambda B1S1', value: Number((data[0] / 200).toFixed(2)), unit: 'V', extra: { trim } };
      }
      case '22': { // Presión relativa del rail: 0.079*(256*A+B)
        if (data.length < 2) return null;
        return { pid: '0122', name: 'Presión relativa del rail', value: Math.round(0.079 * ((data[0] * 256) + data[1])), unit: 'kPa' };
      }
      case '23': { // Presión de rail: 10*(256*A+B)
        if (data.length < 2) return null;
        return { pid: '0123', name: 'Presión del rail', value: 10 * ((data[0] * 256) + data[1]), unit: 'kPa' };
      }
      case '2F': { // Nivel de combustible: 100/255*A
        if (data.length < 1) return null;
        return { pid: '012F', name: 'Nivel de combustible', value: Math.round((100 / 255) * data[0]), unit: '%' };
      }
      case '33': { // Presión barométrica: A
        if (data.length < 1) return null;
        return { pid: '0133', name: 'Presión barométrica', value: data[0], unit: 'kPa' };
      }
      case '3C': { // Temperatura del catalizador B1S1: (256*A+B)/10 - 40
        if (data.length < 2) return null;
        return { pid: '013C', name: 'Temp. catalizador B1S1', value: Number((((data[0] * 256) + data[1]) / 10 - 40).toFixed(1)), unit: '°C' };
      }
      case '42': { // Tensión del módulo: (256*A+B)/1000
        if (data.length < 2) return null;
        return { pid: '0142', name: 'Tensión del módulo', value: Number((((data[0] * 256) + data[1]) / 1000).toFixed(2)), unit: 'V' };
      }
      case '44': { // Lambda comandada: 2/65536*(256*A+B)
        if (data.length < 2) return null;
        return { pid: '0144', name: 'Lambda comandada', value: Number(((2 / 65536) * ((data[0] * 256) + data[1])).toFixed(3)), unit: 'λ' };
      }
      case '46': { // Temperatura ambiente: A - 40
        if (data.length < 1) return null;
        return { pid: '0146', name: 'Temp. ambiente', value: data[0] - 40, unit: '°C' };
      }
      case '49': { // Posición del pedal: 100/255*A
        if (data.length < 1) return null;
        return { pid: '0149', name: 'Posición del pedal', value: Math.round((100 / 255) * data[0]), unit: '%' };
      }
      case '5C': { // Temperatura del aceite: A - 40
        if (data.length < 1) return null;
        return { pid: '015C', name: 'Temp. del aceite', value: data[0] - 40, unit: '°C' };
      }
      case '5E': { // Consumo de combustible: (256*A+B)/20
        if (data.length < 2) return null;
        return { pid: '015E', name: 'Consumo de combustible', value: Number((((data[0] * 256) + data[1]) / 20).toFixed(2)), unit: 'L/h' };
      }
      case '62': { // Par motor real: A - 125
        if (data.length < 1) return null;
        return { pid: '0162', name: 'Par motor real', value: data[0] - 125, unit: '%' };
      }
      case '63': { // Par de referencia: 256*A+B
        if (data.length < 2) return null;
        return { pid: '0163', name: 'Par de referencia', value: (data[0] * 256) + data[1], unit: 'Nm' };
      }
      case '7C': { // Temperatura del DPF B1: (256*A+B)/10 - 40
        if (data.length < 2) return null;
        return { pid: '017C', name: 'Temp. del DPF', value: Number((((data[0] * 256) + data[1]) / 10 - 40).toFixed(1)), unit: '°C' };
      }
      default:
        return { pid, raw, bytes: data };
    }
  }

  // Decodifica códigos DTC de Modo 03 (Almacenados) y Modo 07 (Pendientes)
  static parseDTCs(raw, expectedPrefix = 0x43) {
    if (this.isError(raw)) return [];

    // Un 43/47 seguido únicamente de ceros significa "sin códigos".
    // No debe confundirse con un código válido como P0029 (43 00 29...).
    const compact = this.clean(raw).replace(/\s+/g, '').toUpperCase();
    if (/^(43|47)(00)+$/.test(compact)) return [];

    const bytes = this.hexToBytes(raw);
    const dtcs = [];

    // Localizar prefijo 0x43 o 0x47
    let startIdx = bytes.indexOf(expectedPrefix);
    if (startIdx === -1) {
      // Buscar si vino sin cabecera o con cabecera alternativa
      startIdx = bytes.findIndex(b => b === 0x43 || b === 0x47);
    }
    const data = startIdx !== -1 ? bytes.slice(startIdx + 1) : bytes;

    const PREFIX_MAP = ['P', 'C', 'B', 'U'];

    for (let i = 0; i + 1 < data.length; i += 2) {
      const b1 = data[i];
      const b2 = data[i + 1];

      // 00 00 indica padding / sin más códigos
      if (b1 === 0 && b2 === 0) continue;

      const prefixType = (b1 >> 6) & 0x03;
      const firstDigit = (b1 >> 4) & 0x03;
      const secondDigit = b1 & 0x0F;
      const thirdDigit = (b2 >> 4) & 0x0F;
      const fourthDigit = b2 & 0x0F;

      const code = `${PREFIX_MAP[prefixType]}${firstDigit}${secondDigit.toString(16).toUpperCase()}${thirdDigit.toString(16).toUpperCase()}${fourthDigit.toString(16).toUpperCase()}`;

      if (!dtcs.includes(code)) {
        dtcs.push(code);
      }
    }

    return dtcs;
  }

  // Decodifica VIN de Modo 09 02 (soporta respuestas multiframe)
  static parseVIN(raw) {
    // Conservar la separación por líneas/frames para poder descartar la cabecera 49 02 NN.
    const lines = String(raw || '').split(/[\r\n]+/);
    let vinChars = '';

    for (const line of lines) {
      const bytes = this.hexToBytes(line);
      if (!bytes.length) continue;

      let start = 0;
      const idx = bytes.indexOf(0x49);
      if (idx !== -1 && bytes[idx + 1] === 0x02) {
        // 49 02 <nº frame> -> los datos del VIN empiezan tras la cabecera.
        start = idx + 3;
      }
      for (let i = start; i < bytes.length; i++) {
        const b = bytes[i];
        if ((b >= 48 && b <= 57) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122)) {
          vinChars += String.fromCharCode(b);
        }
      }
    }

    // Un VIN estándar tiene 17 caracteres (sin I, O ni Q).
    const match = vinChars.match(/[A-HJ-NPR-Z0-9]{17}/i);
    return match ? match[0].toUpperCase() : (vinChars.length >= 17 ? vinChars.slice(-17).toUpperCase() : vinChars);
  }
}

// ----------------------------------------------------------------------
// SIMULADOR VIRTUAL DE ECU (Para navegadores sin soporte o pruebas)
// ----------------------------------------------------------------------
class VirtualECUSimulator {
  constructor() {
    this.connected = false;
    this.voltage = 14.1;
    this.rpm = 840;
    this.speed = 0;
    this.coolant = 89;
    this.load = 22;
    this.throttle = 14;
    this.iat = 24;
    this.maf = 9.8;
    this.map = 66;
    this.baro = 101;
    this.timing = 11.3;
    this.stft = 1.2;
    this.ltft = 2.5;
    this.lambda = 0.99;
    this.fuelLevel = 62;
    this.oil = 90.6;
    this.rail = 36720;
    this.fuelRate = 1.69;
    this.dpf = 246;
    this.ambient = 24;
    this.o2 = 0.53;
    this.torque = 22;
    this.storedDTCs = ['P0299', 'P0300'];
    this.pendingDTCs = ['P0101'];
    this.dtcCleared = false;
  }

  connect() {
    this.connected = true;
    return Promise.resolve();
  }

  disconnect() {
    this.connected = false;
    return Promise.resolve();
  }

  // Simula el comportamiento dinámico de un motor en marcha
  updateTelemetry() {
    if (!this.connected) return;
    // Variación realista de parámetros
    this.rpm = Math.max(780, Math.min(3200, Math.round(this.rpm + (Math.random() * 80 - 40))));
    this.speed = this.rpm > 1200 ? Math.round((this.rpm - 1000) / 25) : 0;
    this.load = Math.max(15, Math.min(75, Math.round(18 + (this.rpm / 80) + (Math.random() * 4))));
    this.coolant = Math.max(85, Math.min(94, Number((this.coolant + (Math.random() * 0.4 - 0.2)).toFixed(1))));
    this.throttle = Math.round(12 + (this.load * 0.4));
    this.voltage = Number((14.0 + (Math.random() * 0.3 - 0.1)).toFixed(1));
    this.maf = Number((2.5 + this.load * 0.33).toFixed(1));
    this.map = Math.round(35 + this.load * 1.4);
    this.timing = Number((8 + this.load * 0.15).toFixed(1));
    this.stft = Number((Math.random() * 6 - 3).toFixed(1));
    this.ltft = Number((2 + Math.random() * 1.5).toFixed(1));
    this.lambda = Number((0.99 + (Math.random() * 0.02 - 0.01)).toFixed(3));
    this.oil = Number((88 + this.load * 0.12).toFixed(1));
    this.rail = Math.round(30000 + this.rpm * 8);
    this.fuelRate = Number((0.7 + this.load * 0.045).toFixed(2));
    this.dpf = Math.round(180 + this.load * 3);
    this.o2 = Number((0.4 + this.load * 0.006).toFixed(2));
    this.torque = this.load;
  }

  byte(value) {
    return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase();
  }

  word(value) {
    const v = Math.max(0, Math.min(65535, Math.round(value)));
    return [this.byte(v >> 8), this.byte(v & 0xFF)];
  }

  sendCommand(cmd) {
    this.updateTelemetry();
    const c = cmd.trim().toUpperCase();

    // Comandos AT de inicialización
    if (c === 'ATZ' || c === 'AT WS') return Promise.resolve('ELM327 v1.5\r\r>');
    if (c === 'ATE0' || c === 'ATE1') return Promise.resolve('OK\r\r>');
    if (c === 'ATL0' || c === 'ATL1') return Promise.resolve('OK\r\r>');
    if (c === 'ATH0' || c === 'ATH1') return Promise.resolve('OK\r\r>');
    if (c.startsWith('ATSP')) return Promise.resolve('OK\r\r>');
    if (c === 'ATDP') return Promise.resolve('ISO 15765-4 (CAN 11/500)\r\r>');
    if (c === 'ATRV') return Promise.resolve(`${this.voltage.toFixed(1)}V\r\r>`);
    if (c === 'ATI') return Promise.resolve('ELM327 v1.5 (Simulador Virtual)\r\r>');

    // Modo 01 (Datos en vivo)
    if (c === '0100') return Promise.resolve('41 00 BE 3F B8 11\r\r>');
    if (c === '010C' || c === '01 0C') {
      const val = Math.round(this.rpm * 4);
      const a = (val >> 8) & 0xFF;
      const b = val & 0xFF;
      return Promise.resolve(`41 0C ${a.toString(16).padStart(2, '0')} ${b.toString(16).padStart(2, '0')}\r\r>`);
    }
    if (c === '010D' || c === '01 0D') {
      return Promise.resolve(`41 0D ${this.speed.toString(16).padStart(2, '0')}\r\r>`);
    }
    if (c === '0105' || c === '01 05') {
      const a = Math.round(this.coolant + 40);
      return Promise.resolve(`41 05 ${a.toString(16).padStart(2, '0')}\r\r>`);
    }
    if (c === '0104' || c === '01 04') {
      const a = Math.round((this.load * 255) / 100);
      return Promise.resolve(`41 04 ${a.toString(16).padStart(2, '0')}\r\r>`);
    }
    if (c === '010F' || c === '01 0F') {
      const a = Math.round(this.iat + 40);
      return Promise.resolve(`41 0F ${a.toString(16).padStart(2, '0')}\r\r>`);
    }
    if (c === '0111' || c === '01 11') {
      const a = Math.round((this.throttle * 255) / 100);
      return Promise.resolve(`41 11 ${a.toString(16).padStart(2, '0')}\r\r>`);
    }
    if (c === '0106' || c === '01 06') {
      return Promise.resolve(`41 06 ${this.byte((this.stft + 100) * 128 / 100)}\r\r>`);
    }
    if (c === '0107' || c === '01 07') {
      return Promise.resolve(`41 07 ${this.byte((this.ltft + 100) * 128 / 100)}\r\r>`);
    }
    if (c === '010A' || c === '01 0A') {
      return Promise.resolve(`41 0A ${this.byte(100)}\r\r>`);
    }
    if (c === '010B' || c === '01 0B') {
      return Promise.resolve(`41 0B ${this.byte(this.map)}\r\r>`);
    }
    if (c === '010E' || c === '01 0E') {
      return Promise.resolve(`41 0E ${this.byte((this.timing + 64) * 2)}\r\r>`);
    }
    if (c === '0110' || c === '01 10') {
      return Promise.resolve(`41 10 ${this.word(this.maf * 100).join(' ')}\r\r>`);
    }
    if (c === '0114' || c === '01 14') {
      return Promise.resolve(`41 14 ${this.byte(this.o2 * 200)} ${this.byte((this.stft + 100) * 128 / 100)}\r\r>`);
    }
    if (c === '0122' || c === '01 22') {
      return Promise.resolve(`41 22 ${this.word(Math.max(0, this.rail - this.baro) / 0.079).join(' ')}\r\r>`);
    }
    if (c === '0123' || c === '01 23') {
      return Promise.resolve(`41 23 ${this.word(this.rail / 10).join(' ')}\r\r>`);
    }
    if (c === '012F' || c === '01 2F') {
      return Promise.resolve(`41 2F ${this.byte(this.fuelLevel * 255 / 100)}\r\r>`);
    }
    if (c === '0133' || c === '01 33') {
      return Promise.resolve(`41 33 ${this.byte(this.baro)}\r\r>`);
    }
    if (c === '013C' || c === '01 3C') {
      return Promise.resolve(`41 3C ${this.word((330 + 40) * 10).join(' ')}\r\r>`);
    }
    if (c === '0142' || c === '01 42') {
      return Promise.resolve(`41 42 ${this.word(this.voltage * 1000).join(' ')}\r\r>`);
    }
    if (c === '0144' || c === '01 44') {
      return Promise.resolve(`41 44 ${this.word(this.lambda * 65536 / 2).join(' ')}\r\r>`);
    }
    if (c === '0146' || c === '01 46') {
      return Promise.resolve(`41 46 ${this.byte(this.ambient + 40)}\r\r>`);
    }
    if (c === '0149' || c === '01 49') {
      return Promise.resolve(`41 49 ${this.byte(this.throttle * 255 / 100)}\r\r>`);
    }
    if (c === '015C' || c === '01 5C') {
      return Promise.resolve(`41 5C ${this.byte(this.oil + 40)}\r\r>`);
    }
    if (c === '015E' || c === '01 5E') {
      return Promise.resolve(`41 5E ${this.word(this.fuelRate * 20).join(' ')}\r\r>`);
    }
    if (c === '0162' || c === '01 62') {
      return Promise.resolve(`41 62 ${this.byte(this.torque + 125)}\r\r>`);
    }
    if (c === '0163' || c === '01 63') {
      return Promise.resolve(`41 63 ${this.word(250).join(' ')}\r\r>`);
    }
    if (c === '017C' || c === '01 7C') {
      return Promise.resolve(`41 7C ${this.word((this.dpf + 40) * 10).join(' ')}\r\r>`);
    }

    // Modo 03 (Códigos almacenados)
    if (c === '03') {
      if (this.dtcCleared || !this.storedDTCs.length) {
        return Promise.resolve('43 00 00 00 00 00\r\r>');
      }
      // P0299 = 0x02, 0x99; P0300 = 0x03, 0x00
      return Promise.resolve('43 02 99 03 00 00 00\r\r>');
    }

    // Modo 07 (Códigos pendientes)
    if (c === '07') {
      if (this.dtcCleared || !this.pendingDTCs.length) {
        return Promise.resolve('47 00 00 00 00 00\r\r>');
      }
      // P0101 = 0x01, 0x01
      return Promise.resolve('47 01 01 00 00 00 00\r\r>');
    }

    // Modo 04 (Borrado de averías)
    if (c === '04') {
      this.dtcCleared = true;
      this.storedDTCs = [];
      this.pendingDTCs = [];
      return Promise.resolve('44\r\r>');
    }

    // Modo 09 02 (VIN)
    if (c === '0902' || c === '09 02') {
      // VIN Simulado: VSSZZZ5PZ9R012345
      return Promise.resolve('49 02 01 56 53 53 5A\r49 02 02 5A 5A 35 50 5A\r49 02 03 39 52 30 31 32\r49 02 04 33 34 35 00 00\r\r>');
    }

    return Promise.resolve('NO DATA\r\r>');
  }
}

// ----------------------------------------------------------------------
// GESTOR PRINCIPAL ELM327 (Serial, Bluetooth y Simulador)
// ----------------------------------------------------------------------
class ELM327Manager {
  constructor() {
    this.mode = 'simulated'; // 'serial' | 'bluetooth' | 'simulated'
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'reading' | 'error'
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.gattServer = null;
    this.rxChar = null;
    this.txChar = null;
    this.bleBuffer = '';
    this.bleHandler = null;
    this.simulator = new VirtualECUSimulator();
    this.baudRate = 38400;
    this.protocolName = 'Desconocido';
    this.version = 'N/A';
    this.voltage = 'N/A';
    this.liveInterval = null;
    this.telemetryReading = false;
    this.lastTelemetry = null;
    this.listeners = {
      status: [],
      terminal: [],
      telemetry: [],
      dtcs: []
    };
  }

  on(event, fn) {
    if (this.listeners[event]) this.listeners[event].push(fn);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(fn => {
        try { fn(data); } catch (e) { console.error(`Error en listener ${event}:`, e); }
      });
    }
  }

  logTerminal(direction, text) {
    this.emit('terminal', { direction, text: text.trim(), time: new Date() });
  }

  setStatus(newStatus, info = '') {
    this.status = newStatus;
    this.emit('status', { status: newStatus, mode: this.mode, info });
  }

  // Comprueba compatibilidad del navegador
  static checkBrowserSupport() {
    return {
      serial: 'serial' in navigator,
      bluetooth: 'bluetooth' in navigator
    };
  }

  // Conexión principal
  async connect(mode = 'simulated', baudRate = 38400) {
    this.mode = mode;
    this.baudRate = Number(baudRate) || 38400;
    this.setStatus('connecting', `Iniciando conexión ${mode.toUpperCase()}...`);

    try {
      if (mode === 'serial') {
        if (!('serial' in navigator)) {
          throw new Error('Tu navegador no soporta Web Serial API. Usa Google Chrome, Microsoft Edge o activa el Modo Simulador.');
        }
        this.port = await navigator.serial.requestPort();
        await this.port.open({ baudRate: this.baudRate });

        const textDecoder = new TextDecoderStream();
        this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
        this.reader = textDecoder.readable.getReader();

        const textEncoder = new TextEncoderStream();
        this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
        this.writer = textEncoder.writable.getWriter();

      } else if (mode === 'bluetooth') {
        if (!('bluetooth' in navigator)) {
          throw new Error('Tu navegador no soporta Web Bluetooth API. Usa Google Chrome, Edge o activa el Modo Simulador.');
        }
        // Filtros habituales para ELM327 BLE / SPP
        const device = await navigator.bluetooth.requestDevice({
          filters: [
            { namePrefix: 'OBD' },
            { namePrefix: 'ELM' },
            { namePrefix: 'V-LINK' },
            { namePrefix: 'Viecar' }
          ],
          optionalServices: [
            '0000fff0-0000-1000-8000-00805f9b34fb', // Servicio SPP común
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
            '0000ffe0-0000-1000-8000-00805f9b34fb'
          ]
        });

        this.gattServer = await device.gatt.connect();
        // Buscar servicio y características de escritura/notificación en todos los servicios
        const services = await this.gattServer.getPrimaryServices();
        if (!services.length) throw new Error('No se encontraron servicios Bluetooth en el adaptador.');

        for (const service of services) {
          let chars = [];
          try { chars = await service.getCharacteristics(); } catch (e) { continue; }
          if (!this.txChar) this.txChar = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
          if (!this.rxChar) this.rxChar = chars.find(c => c.properties.notify);
          if (!this.rxChar) this.rxChar = chars.find(c => c.properties.read);
          if (this.txChar && this.rxChar) break;
        }
        if (!this.txChar) throw new Error('El dispositivo Bluetooth no admite escritura serie AT.');

        if (this.rxChar && this.rxChar.properties.notify) {
          const decoder = new TextDecoder();
          this.bleBuffer = '';
          this.bleHandler = event => {
            const value = event.target.value;
            this.bleBuffer += decoder.decode(value);
          };
          this.rxChar.addEventListener('characteristicvaluechanged', this.bleHandler);
          await this.rxChar.startNotifications();
        }

      } else {
        // Modo Simulador
        await this.simulator.connect();
      }

      // Inicialización AT del ELM327
      await this.initELM327();
      this.setStatus('connected', `Conectado exitosamente (${this.version})`);
      return { success: true, mode: this.mode, version: this.version, protocol: this.protocolName, voltage: this.voltage };

    } catch (err) {
      this.setStatus('error', err.message);
      this.disconnect().catch(() => {});
      throw err;
    }
  }

  // Envío y recepción de un comando AT/OBD con timeout
  async send(command, timeoutMs = 4000) {
    const cmd = command.trim();
    this.logTerminal('TX', cmd);

    if (this.mode === 'simulated') {
      const reply = await this.simulator.sendCommand(cmd);
      this.logTerminal('RX', reply);
      return reply;
    }

    if (this.mode === 'serial') {
      if (!this.writer || !this.reader) throw new Error('Puerto serie no conectado');

      // Limpiar buffers previos enviando el comando con retorno de carro
      await this.writer.write(cmd + '\r');

      let response = '';
      const start = Date.now();

      while (Date.now() - start < timeoutMs) {
        const { value, done } = await Promise.race([
          this.reader.read(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de respuesta ELM327')), timeoutMs))
        ]);
        if (done) break;
        if (value) {
          response += value;
          // El ELM327 finaliza la respuesta con el prompt '>'
          if (response.includes('>')) break;
        }
      }

      this.logTerminal('RX', response);
      return response;
    }

    if (this.mode === 'bluetooth') {
      if (!this.txChar) throw new Error('Bluetooth no conectado');
      const enc = new TextEncoder();
      this.bleBuffer = '';
      await this.txChar.writeValue(enc.encode(cmd + '\r'));

      // Esperar a que llegue el prompt '>' por notificaciones BLE.
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (this.bleBuffer && this.bleBuffer.includes('>')) break;
        await new Promise(r => setTimeout(r, 50));
      }
      const response = this.bleBuffer || '';
      this.bleBuffer = '';
      this.logTerminal('RX', response || '(sin respuesta)');
      return response || 'NO DATA\r\r>';
    }

    throw new Error('Modo de conexión desconocido');
  }

  // Secuencia de inicialización homologada ELM327
  async initELM327() {
    this.setStatus('connecting', 'Configurando protocolo ATZ/ATSP0...');

    // 1. Reset
    const rz = await this.send('ATZ', 5000);
    this.version = OBDParser.clean(rz) || 'ELM327';

    // 2. Desactivar eco (ATE0)
    await this.send('ATE0', 2000);
    // 3. Desactivar linefeeds (ATL0)
    await this.send('ATL0', 2000);
    // 4. Desactivar headers (ATH0)
    await this.send('ATH0', 2000);
    // 5. Configurar protocolo automático (ATSP0)
    await this.send('ATSP0', 3000);
    // 6. Leer tensión de batería (ATRV)
    const rv = await this.send('ATRV', 2000);
    this.voltage = OBDParser.clean(rv);
    // 7. Describir protocolo activo
    const rdp = await this.send('ATDP', 2000);
    this.protocolName = OBDParser.clean(rdp) || 'Protocolo OBD-II Estándar';
  }

  // Lectura de códigos DTC (Modo 03 Almacenados y Modo 07 Pendientes)
  async readDTCs() {
    if (this.status !== 'connected' && this.status !== 'reading') {
      throw new Error('Adaptador no conectado.');
    }

    this.setStatus('reading', 'Consultando códigos DTC (Modo 03 y 07)...');
    try {
      const rawStored = await this.send('03', 6000);
      const rawPending = await this.send('07', 6000);

      // Si ninguna de las dos consultas obtiene respuesta válida, no se puede
      // afirmar que la ECU no tenga averías: se informa del fallo de enlace.
      if (OBDParser.isError(rawStored) && OBDParser.isError(rawPending)) {
        throw new Error('La ECU no respondió a la lectura de códigos (sin datos). Comprueba el contacto y el protocolo.');
      }

      const stored = OBDParser.parseDTCs(rawStored, 0x43);
      const pending = OBDParser.parseDTCs(rawPending, 0x47);

      const allCodes = [...new Set([...stored, ...pending])];

      const result = {
        stored,
        pending,
        all: allCodes,
        total: allCodes.length,
        timestamp: new Date()
      };

      this.emit('dtcs', result);
      this.setStatus('connected', `Diagnóstico finalizado: ${allCodes.length} averías encontradas.`);
      return result;
    } catch (err) {
      this.setStatus('connected', `No se pudo completar la lectura: ${err.message}`);
      throw err;
    }
  }

  // Lectura de parámetros en vivo (Modo 01)
  async readSingleTelemetry() {
    if (this.telemetryReading) return this.lastTelemetry || { voltage: this.voltage };
    this.telemetryReading = true;
    const data = {
      voltage: this.voltage
    };

    const readings = [
      ['010C', 'rpm'], ['010D', 'speed'], ['0105', 'coolant'], ['0104', 'load'],
      ['0111', 'throttle'], ['0149', 'pedal'], ['010F', 'iat'], ['0110', 'maf'],
      ['010B', 'map'], ['0133', 'baro'], ['010E', 'timing'], ['0106', 'stft'],
      ['0107', 'ltft'], ['0144', 'lambda'], ['0114', 'o2'], ['012F', 'fuelLevel'],
      ['015C', 'oil'], ['0123', 'railPressure'], ['0142', 'moduleVoltage'],
      ['015E', 'fuelRate'], ['013C', 'catalyst'], ['017C', 'dpf'],
      ['0146', 'ambient'], ['0162', 'torque']
    ];

    try {
      for (const [pid, key] of readings) {
        try {
          const raw = await this.send(pid, 900);
          const parsed = OBDParser.parseMode01(pid, raw);
          if (parsed && parsed.value !== undefined && parsed.value !== null) data[key] = parsed.value;
          if (parsed?.extra && parsed.extra.trim !== undefined) data.o2Trim = parsed.extra.trim;
        } catch (err) {
          // Un PID no soportado no invalida el resto de la lectura.
        }
      }

      if (data.moduleVoltage) {
        data.voltage = data.moduleVoltage;
        this.voltage = data.moduleVoltage;
      } else {
        try {
          const rVolt = await this.send('ATRV', 1200);
          const cleanVolt = OBDParser.clean(rVolt);
          if (cleanVolt && cleanVolt.includes('V')) {
            data.voltage = cleanVolt;
            this.voltage = cleanVolt;
          }
        } catch (err) { /* mantener última tensión conocida */ }
      }

      if (data.map !== undefined && data.baro !== undefined) {
        data.boost = Math.max(0, data.map - data.baro);
      }
      if (data.railPressure !== undefined) {
        data.railBar = Math.round(data.railPressure / 100);
      }

      data.timestamp = new Date();
      this.lastTelemetry = data;
      this.emit('telemetry', data);
      return data;
    } finally {
      this.telemetryReading = false;
    }
  }

  // Inicia monitoreo continuo en vivo
  startLiveMonitoring(intervalMs = 1200) {
    if (this.liveInterval) clearInterval(this.liveInterval);
    this.liveInterval = setInterval(() => {
      if (this.status === 'connected') {
        this.readSingleTelemetry().catch(() => {});
      }
    }, intervalMs);
  }

  stopLiveMonitoring() {
    if (this.liveInterval) {
      clearInterval(this.liveInterval);
      this.liveInterval = null;
    }
  }

  // Borrado de códigos DTC (Modo 04) con advertencia
  async clearDTCs() {
    if (this.status !== 'connected') throw new Error('El adaptador debe estar conectado para borrar averías.');
    this.setStatus('reading', 'Enviando comando de borrado de códigos (Modo 04)...');
    const reply = await this.send('04', 5000);
    const cleaned = OBDParser.clean(reply).toUpperCase();
    if (!/^44\b/.test(cleaned)) {
      this.setStatus('connected', 'La ECU no confirmó el borrado de códigos.');
      throw new Error(`La ECU no confirmó el borrado (respuesta: ${cleaned || 'vacía'}).`);
    }
    this.setStatus('connected', 'Averías borradas (Monitores reseteados).');
    return reply;
  }

  // Lectura de VIN del vehículo (Modo 09 02)
  async readVIN() {
    try {
      const reply = await this.send('0902', 4000);
      const vin = OBDParser.parseVIN(reply);
      return vin || 'No disponible por protocolo estándar';
    } catch (e) {
      return 'No disponible';
    }
  }

  // Desconexión limpia
  async disconnect() {
    this.stopLiveMonitoring();
    try {
      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        if (this.reader.releaseLock) this.reader.releaseLock();
        this.reader = null;
      }
      if (this.writer) {
        await this.writer.close().catch(() => {});
        if (this.writer.releaseLock) this.writer.releaseLock();
        this.writer = null;
      }
      // Esperar el cierre efectivo de los streams serie antes de liberar el puerto.
      if (this.writableStreamClosed) { await this.writableStreamClosed.catch(() => {}); this.writableStreamClosed = null; }
      if (this.readableStreamClosed) { await this.readableStreamClosed.catch(() => {}); this.readableStreamClosed = null; }
      if (this.port) {
        await this.port.close().catch(() => {});
        this.port = null;
      }
      if (this.rxChar) {
        try {
          if (this.bleHandler) this.rxChar.removeEventListener('characteristicvaluechanged', this.bleHandler);
          if (this.rxChar.properties.notify) await this.rxChar.stopNotifications();
        } catch (e) { /* ignorar */ }
        this.rxChar = null;
        this.bleHandler = null;
      }
      if (this.txChar) this.txChar = null;
      if (this.gattServer) {
        this.gattServer.disconnect();
        this.gattServer = null;
      }
      if (this.simulator) {
        await this.simulator.disconnect();
      }
    } catch (e) {
      console.warn('Cierre de puerto:', e);
    }
    this.setStatus('disconnected', 'Adaptador desconectado.');
  }
}

// Exportación global para frontend
window.OBDParser = OBDParser;
window.ELM327Manager = ELM327Manager;
