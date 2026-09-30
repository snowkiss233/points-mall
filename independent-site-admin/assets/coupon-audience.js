/* 指定人群 Excel 导入：仅解析数据，不执行公式，不上传文件。 */
const CouponAudience = (() => {
  const maxRows=10000,maxBytes=5*1024*1024;
  function parse(buffer){
    const bytes=new Uint8Array(buffer);
    if(bytes.length>maxBytes)throw Error('Excel 文件不能超过 5 MB');
    if(bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('请上传真实的 .xlsx Excel 文件');
    let book;try{book=XLSX.read(bytes,{type:'array',cellFormula:true,sheetRows:maxRows+2});}catch{throw Error('Excel 无法读取，请使用模板重新保存为 .xlsx');}
    const populated=book.SheetNames.filter(name=>book.Sheets[name]?.['!fullref']||Object.entries(book.Sheets[name]||{}).some(([key,cell])=>key[0]!=='!'&&(cell.f||cell.v!=null&&String(cell.v).trim())));
    if(populated.length>1)throw Error('仅支持一个含数据的工作表，请将全部 UID 合并到同一工作表后上传');
    const sheet=book.Sheets[populated[0]];
    if(!sheet||sheet.A1?.f||String(sheet.A1?.v||'').trim().toUpperCase()!=='UID')throw Error('Excel 首行 A1 必须为 UID，请使用下载的模板');
    const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
    if(range.e.r>maxRows)throw Error('单次最多导入 10,000 行 UID');
    const seen=new Set(),uids=[],errors=[];let duplicates=0,rows=0;
    for(const [address,cell] of Object.entries(sheet)){
      if(address[0]==='!')continue;
      if(XLSX.utils.decode_cell(address).c>0&&(cell.f||cell.v!=null&&String(cell.v).trim()))throw Error('模板仅支持 UID 一列，请移除其他数据列');
    }
    for(let row=2;row<=range.e.r+1;row++){
      const cell=sheet['A'+row];if(!cell||!cell.f&&(cell.v==null||String(cell.v).trim()===''))continue;
      rows++;
      if(cell.f){errors.push(`第 ${row} 行不能使用公式`);continue;}
      if(!['s','str','n'].includes(cell.t)||cell.t==='n'&&(!Number.isSafeInteger(cell.v)||cell.v<0||String(cell.v).length>15)){
        errors.push(`第 ${row} 行 UID 请以文本格式填写，避免数字精度丢失`);continue;
      }
      const value=String(cell.v).trim();
      if(cell.t==='n'&&String(cell.w??XLSX.utils.format_cell(cell)).trim()!==value){
        errors.push(`第 ${row} 行 UID 的显示格式与实际值不一致，请改为文本格式并重新填写完整 UID`);continue;
      }
      if(seen.has(value)){duplicates++;continue;}seen.add(value);uids.push(value);
    }
    if(errors.length)throw Error(errors.slice(0,5).join('；')+(errors.length>5?'；另有 '+(errors.length-5)+' 行错误':''));
    if(!uids.length)throw Error('Excel 中没有 UID，请从第 2 行起填写');
    return {uids,duplicates,rows};
  }
  return {parse,maxRows,maxBytes};
})();
