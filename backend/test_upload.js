import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';

const filePath = 'C:/Users/Pratheeksha G/.gemini/antigravity/scratch/predictive-maintenance-platform/data/PREDICTIVE_MAINTENANCE_FINAL_3150.xlsx';

async function testUpload() {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    const res = await axios.post('http://localhost:5000/api/dataset/upload-validate', form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    console.log('Upload Result:', res.data);
  } catch (err) {
    console.error('Upload Failed:', err.response?.data || err.message);
  }
}

testUpload();
