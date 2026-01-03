# Gunakan Python versi 3.9
FROM python:3.9

# Set folder kerja di dalam server
WORKDIR /code

# Copy file requirements dan install library
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy semua file backend ke server
COPY . /code

# Buka port 7860 (Port standar Hugging Face)
# Dan jalankan aplikasi
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]