/* ══════════════════════════════════════════
       MOCK DATA
    ══════════════════════════════════════════ */
    const today = new Date();
 
    function daysFromNow(n) {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return d;
    }
 console.log(daysFromNow(3));