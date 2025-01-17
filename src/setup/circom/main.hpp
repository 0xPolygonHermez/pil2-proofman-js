#ifndef MAIN_CIRCOM_HPP
#define MAIN_CIRCOM_HPP

#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <sys/stat.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <nlohmann/json.hpp>
#include <vector>
#include <chrono>

using json = nlohmann::json;

#include "calcwit.hpp"
#include "circom.hpp"

using namespace std;

Circom_Circuit *loadCircuit(std::string const &datFileName);
void freeCircuit(Circom_Circuit *circuit);
void loadJson(Circom_CalcWit *ctx, std::string filename);
void loadJsonImpl(Circom_CalcWit *ctx, json &j);
void writeBinWitness(Circom_CalcWit *ctx, std::string wtnsFileName);
bool check_valid_number(std::string &s, uint base);

extern "C" __attribute__((visibility("default"))) uint64_t getSizeWitness();
extern "C" __attribute__((visibility("default"))) void getWitness(void *zkin, char* datFile, void* pWitness, uint64_t nMutexes = NMUTEXES);

#endif
